import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wifi, WifiOff, QrCode, RefreshCw, Send, Users, UserCheck,
  Clock, CheckCircle, XCircle, Loader2, Plus, Trash2, Edit3,
  Calendar, Filter, Search, GraduationCap, ChevronDown, X,
  History, Settings, Bell, AlertCircle, Smartphone, AlarmClock,
} from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const INTERVAL_PRESETS = [
  { label: 'كل أسبوع',     days: 7   },
  { label: 'كل أسبوعين',   days: 14  },
  { label: 'كل 3 أسابيع',  days: 21  },
  { label: 'كل شهر',       days: 30  },
  { label: 'كل شهرين',     days: 60  },
  { label: 'كل 3 أشهر',    days: 90  },
  { label: 'مخصص',         days: null },
];

const TARGET_OPTIONS = [
  { value: 'parents',  label: 'أولياء الأمور فقط',    short: 'أولياء',  icon: '👨‍👩‍👧' },
  { value: 'students', label: 'الطلاب فقط',            short: 'الطلاب',  icon: '👤' },
  { value: 'both',     label: 'الطلاب وأولياء الأمور', short: 'الجميع',  icon: '👥' },
];

const WA_PARENT_TEMPLATES = [
  {
    title: '📊 تقرير أداء شهري',
    text:
      'السلام عليكم ورحمة الله وبركاته 🌙\n' +
      'نُرسل إليكم تقرير أداء الطالب/ة:\n\n' +
      '👤 الاسم: {student_name}\n' +
      '🎓 المرحلة: {stage}\n' +
      '📝 عدد الاختبارات: {exam_count}\n' +
      '🎯 متوسط الدرجات: {avg_score}%\n\n' +
      '📲 لمتابعة التفاصيل الكاملة — درجات كل اختبار والكورسات — يمكنكم الدخول على بوابة ولي الأمر مباشرةً:\n' +
      '{portal_link}\n\n' +
      'نتمنى لأبنائنا التوفيق دائماً 🌟\n' +
      '— منصة وثبة التعليمية 📚',
  },
  {
    title: '⚠️ تنبيه انخفاض الأداء',
    text:
      'السلام عليكم ورحمة الله 🌙\n' +
      'نودّ إعلامكم بأن متوسط درجات الطالب/ة {student_name} ({stage}) بلغ {avg_score}%\n\n' +
      '⚠️ هذه النسبة تستدعي المتابعة والمراجعة.\n\n' +
      '📲 تابعوا التفاصيل عبر بوابة ولي الأمر:\n' +
      '{portal_link}\n\n' +
      'نحن هنا لمساعدتكم، لا تترددوا في التواصل معنا.\n' +
      '— منصة وثبة التعليمية',
  },
  {
    title: '📝 دعوة لاختبار قادم',
    text:
      'السلام عليكم 👋\n' +
      'نُذكّركم بأن الطالب/ة {student_name} لديه/لديها اختبار جديد متاح على منصة وثبة.\n\n' +
      '✅ يُرجى تشجيع الطالب على أداء الاختبار في أقرب وقت.\n\n' +
      '📲 تابعوا النتائج عبر بوابة ولي الأمر:\n' +
      '{portal_link}\n\n' +
      '— منصة وثبة التعليمية 🎓',
  },
  {
    title: '✏️ تذكير بمتابعة الدروس',
    text:
      'السلام عليكم ورحمة الله 🌙\n' +
      'نُذكّركم بمتابعة الطالب/ة {student_name} في مشاهدة دروس المنصة بانتظام.\n\n' +
      'المتابعة المستمرة تُحسّن النتائج بشكل ملحوظ 📈\n\n' +
      '📲 تابعوا تقدم ابنكم/ابنتكم عبر بوابة ولي الأمر:\n' +
      '{portal_link}\n\n' +
      '— منصة وثبة التعليمية 📚',
  },
];

const WA_STUDENT_TEMPLATES = [
  {
    title: '🎯 تذكير بالدراسة',
    text:
      'مرحباً {student_name} 👋\n\n' +
      'تذكّر أن متابعة الدروس بانتظام هو مفتاح النجاح! 🔑\n' +
      'لديك محتوى جديد ينتظرك على منصة وثبة.\n\n' +
      'سجّل دخولك الآن وواصل رحلتك التعليمية 💪\n' +
      '— منصة وثبة التعليمية 📚',
  },
  {
    title: '🏆 تهنئة بنتيجة ممتازة',
    text:
      'مبروك {student_name}! 🎉🏆\n\n' +
      'حققت متوسط درجات {avg_score}% — نتيجة رائعة تستحق التقدير!\n\n' +
      'استمر في هذا المستوى المتميز، نحن فخورون بك 🌟\n' +
      '— منصة وثبة التعليمية',
  },
  {
    title: '📝 اختبار جديد ينتظرك',
    text:
      'مرحباً {student_name} 📝\n\n' +
      'يوجد اختبار جديد متاح لك على منصة وثبة!\n\n' +
      '⏰ لا تؤخر — سجّل دخولك الآن وأدِّ الاختبار.\n' +
      'بالتوفيق والنجاح 🎓\n' +
      '— منصة وثبة التعليمية',
  },
  {
    title: '💪 رسالة تحفيزية',
    text:
      'مرحباً {student_name} 💪\n\n' +
      'النجاح يبدأ بخطوة واحدة — وأنت قادر/ة عليه!\n\n' +
      'ادخل للمنصة اليوم وراجع دروسك وامتحاناتك.\n' +
      'نحن نؤمن بك 🌟\n' +
      '— منصة وثبة التعليمية 📚',
  },
];

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const fmtDaysLabel = (days) => {
  const p = INTERVAL_PRESETS.find(x => x.days === days);
  return p?.days ? p.label : `كل ${days} يوم`;
};

// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    connected:    { color: 'bg-green-100 text-green-700 border-green-200',  icon: <Wifi className="w-3.5 h-3.5" />,         label: 'متصل ✓' },
    connecting:   { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'جاري الاتصال...' },
    qr_ready:     { color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: <QrCode className="w-3.5 h-3.5" />,        label: 'في انتظار المسح' },
    reconnecting: { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />, label: 'إعادة الاتصال...' },
    disconnected: { color: 'bg-gray-100 text-gray-600 border-gray-200',     icon: <WifiOff className="w-3.5 h-3.5" />,      label: 'غير متصل' },
    not_setup:    { color: 'bg-gray-100 text-gray-500 border-gray-200',     icon: <Smartphone className="w-3.5 h-3.5" />,   label: 'لم يتم الإعداد' },
  }[status] || { color: 'bg-gray-100 text-gray-500 border-gray-200', icon: <WifiOff className="w-3.5 h-3.5" />, label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Setup Section (Teacher only) ─────────────────────────────────────────────
function SetupSection({ status, qrBase64, onConnect, onDisconnect, connecting }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-black text-navy-700 flex items-center gap-2 text-base">
          <Settings className="w-4 h-4 text-green-500" /> إعداد واتساب
        </h2>
        <StatusBadge status={status} />
      </div>

      {status === 'connected' ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-green-800 text-sm">واتساب متصل بنجاح ✓</p>
              <p className="text-green-700 text-xs mt-1">يمكنك الآن إرسال الرسائل لأولياء الأمور والطلاب من تبويب "إرسال رسالة".</p>
            </div>
          </div>
          <button
            onClick={onDisconnect}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold text-sm transition-all"
          >
            <WifiOff className="w-4 h-4" /> قطع الاتصال وحذف الجلسة
          </button>
        </div>
      ) : status === 'qr_ready' && qrBase64 ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="font-bold text-blue-800 text-sm mb-1">📱 امسح الكود بواتساب</p>
            <ol className="text-blue-700 text-xs space-y-1 list-decimal list-inside">
              <li>افتح واتساب على موبايلك</li>
              <li>اضغط النقاط الثلاث ← الأجهزة المرتبطة</li>
              <li>اضغط "ربط جهاز" وامسح الكود أدناه</li>
            </ol>
          </div>
          <div className="flex justify-center">
            <div className="p-2 bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              <img src={qrBase64} alt="QR Code" className="w-56 h-56 rounded-xl" />
            </div>
          </div>
          <p className="text-center text-xs text-gray-400">الكود ينتهي بعد دقيقة — إذا انتهى اضغط "تحديث"</p>
          <button onClick={onConnect} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold text-sm transition-all">
            <RefreshCw className="w-4 h-4" /> تحديث الكود
          </button>
        </div>
      ) : (status === 'connecting' || status === 'reconnecting') ? (
        <div className="text-center py-8 space-y-3">
          <Loader2 className="w-10 h-10 text-orange-400 animate-spin mx-auto" />
          <p className="text-sm text-gray-500 font-medium">جاري الاتصال بواتساب...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="font-bold text-orange-800 text-sm mb-1">🔌 لم يتم الربط بعد</p>
            <p className="text-orange-700 text-xs">اضغط الزر أدناه لبدء الربط بواتساب. ستحتاج لمسح QR Code مرة واحدة فقط — بعدها يبقى متصلاً تلقائياً.</p>
          </div>
          <button
            onClick={onConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-black text-sm transition-all shadow-sm"
          >
            {connecting
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <QrCode className="w-5 h-5" />}
            {connecting ? 'جاري التهيئة...' : 'ربط واتساب الآن'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Schedule Modal ────────────────────────────────────────────────────────────
function ScheduleModal({ schedule, stages, onSave, onClose, loading }) {
  const isEdit = !!schedule?.id;
  const [form, setForm] = useState({
    name:          schedule?.name          || '',
    message:       schedule?.message       || '',
    target_type:   schedule?.target_type   || 'parents',
    stage_filter:  schedule?.stage_filter  || 'all',
    interval_days: schedule?.interval_days || 30,
    next_run_at:   schedule?.next_run_at
      ? new Date(schedule.next_run_at).toISOString().slice(0, 16)
      : '',
    is_active:     schedule?.is_active ?? true,
    customDays:    false,
  });

  const presetMatch = INTERVAL_PRESETS.find(p => p.days === form.interval_days);
  const [templateOpen, setTemplateOpen] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-black text-navy-700 flex items-center gap-2">
            <AlarmClock className="w-5 h-5 text-orange-500" />
            {isEdit ? 'تعديل جدولة' : 'إنشاء جدولة جديدة'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">اسم الجدولة *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="input-field text-sm" placeholder="مثال: تقرير شهري لأولياء الأمور" />
          </div>

          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">إرسال إلى</label>
            <div className="grid grid-cols-3 gap-2">
              {TARGET_OPTIONS.map(t => (
                <button key={t.value} onClick={() => set('target_type', t.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border-2 transition-all text-center ${form.target_type === t.value ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <div>{t.icon}</div>
                  <div>{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">المرحلة الدراسية</label>
            <select value={form.stage_filter} onChange={e => set('stage_filter', e.target.value)} className="input-field text-sm">
              <option value="all">جميع المراحل</option>
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-navy-700 mb-2">تكرار الإرسال</label>
            <div className="grid grid-cols-3 gap-2">
              {INTERVAL_PRESETS.filter(p => p.days).map(p => (
                <button key={p.days} onClick={() => set('interval_days', p.days)}
                  className={`py-2 text-xs font-bold rounded-xl border-2 transition-all ${form.interval_days === p.days ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => set('customDays', !form.customDays)}
                className={`py-2 text-xs font-bold rounded-xl border-2 transition-all ${form.customDays ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                مخصص
              </button>
            </div>
            {form.customDays && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min="1" max="365" value={form.interval_days}
                  onChange={e => set('interval_days', parseInt(e.target.value) || 1)}
                  className="input-field text-sm w-24" />
                <span className="text-sm text-gray-500">يوم</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">تاريخ أول إرسال *</label>
            <input type="datetime-local" value={form.next_run_at}
              onChange={e => set('next_run_at', e.target.value)}
              className="input-field text-sm" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold text-navy-700">نص الرسالة *</label>
              <div className="relative">
                <button onClick={() => setTemplateOpen(v => !v)}
                  className="text-xs font-bold text-green-600 hover:underline flex items-center gap-1">
                  قوالب جاهزة <ChevronDown className="w-3 h-3" />
                </button>
                {templateOpen && (
                  <div className="absolute left-0 top-6 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden max-h-72 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-blue-50 border-b border-slate-100">
                      <p className="text-[10px] font-black text-blue-600">👨‍👩‍👧 قوالب أولياء الأمور</p>
                    </div>
                    {WA_PARENT_TEMPLATES.map(t => (
                      <button key={t.title} onClick={() => { set('message', t.text); setTemplateOpen(false); }}
                        className="w-full text-right px-3 py-2.5 hover:bg-green-50 transition-colors border-b border-slate-100 last:border-0">
                        <p className="text-xs font-bold text-navy-700">{t.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{t.text.substring(0, 60)}...</p>
                      </button>
                    ))}
                    <div className="px-3 py-1.5 bg-emerald-50 border-b border-slate-100">
                      <p className="text-[10px] font-black text-emerald-600">👤 قوالب الطلاب</p>
                    </div>
                    {WA_STUDENT_TEMPLATES.map(t => (
                      <button key={t.title} onClick={() => { set('message', t.text); setTemplateOpen(false); }}
                        className="w-full text-right px-3 py-2.5 hover:bg-green-50 transition-colors border-b border-slate-100 last:border-0">
                        <p className="text-xs font-bold text-navy-700">{t.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{t.text.substring(0, 60)}...</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <textarea value={form.message} onChange={e => set('message', e.target.value)}
              className="input-field h-36 resize-none text-sm" dir="rtl"
              placeholder="اكتب نص الرسالة... يمكن استخدام {student_name} {avg_score} {exam_count} {stage}" />
            <p className="text-xs text-gray-400 mt-1">المتغيرات: &#123;student_name&#125; &#123;avg_score&#125; &#123;exam_count&#125; &#123;stage&#125;</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:right-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
            <span className="text-sm font-bold text-navy-700">تفعيل الجدولة</span>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-sm">إلغاء</button>
          <button onClick={() => onSave(form)} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-black text-sm flex items-center justify-center gap-2 transition-all">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isEdit ? 'حفظ التعديلات' : 'إنشاء الجدولة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main WhatsApp Tab ─────────────────────────────────────────────────────────
export default function WhatsAppTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isTeacher = user?.role === 'teacher';

  const [subTab, setSubTab] = useState(isTeacher ? 'setup' : 'send');
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: statusData = {}, refetch: refetchStatus } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status').then(r => r.data),
    refetchInterval: (data) => {
      const s = data?.state?.data?.status;
      return (s === 'connecting' || s === 'qr_ready' || s === 'reconnecting') ? 2500 : 10000;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ['wa-students'],
    queryFn: () => api.get('/whatsapp/students').then(r => r.data),
    enabled: subTab === 'send',
  });

  const { data: schedules = [], refetch: refetchSchedules } = useQuery({
    queryKey: ['wa-schedules'],
    queryFn: () => api.get('/whatsapp/schedules').then(r => r.data),
    enabled: subTab === 'schedules',
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['wa-logs'],
    queryFn: () => api.get('/whatsapp/logs').then(r => r.data),
    enabled: subTab === 'history',
    refetchInterval: subTab === 'history' ? 5000 : false,
  });

  const { status, qrBase64 } = statusData;

  // ── Send state ────────────────────────────────────────────────────────────
  const [search, setSearch]               = useState('');
  const [stageFilter, setStageFilter]     = useState('all');
  const [targetType, setTargetType]       = useState('parents');
  const [selectedIds, setSelectedIds]     = useState([]);
  const [message, setMessage]             = useState('');
  const [templateOpen, setTemplateOpen]   = useState(false);
  const [sending, setSending]             = useState(false);

  // ── Schedule state ────────────────────────────────────────────────────────
  const [showModal, setShowModal]         = useState(false);
  const [editSched, setEditSched]         = useState(null);
  const [schedLoading, setSchedLoading]   = useState(false);

  const stages = ['all', ...new Set(students.map(s => s.academic_stage).filter(Boolean))];

  const filteredStudents = students.filter(s => {
    const matchSearch = !search || s.name.includes(search);
    const matchStage  = stageFilter === 'all' || s.academic_stage === stageFilter;
    return matchSearch && matchStage;
  });

  const toggleStudent = (id) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => {
    if (selectedIds.length === filteredStudents.length && filteredStudents.length > 0)
      setSelectedIds([]);
    else
      setSelectedIds(filteredStudents.map(s => s.id));
  };

  const buildRecipients = () => {
    const sel = students.filter(s => selectedIds.includes(s.id));
    const recs = [];
    sel.forEach(s => {
      if ((targetType === 'students' || targetType === 'both') && s.phone)
        recs.push({ student_id: s.id, phone: s.phone, name: s.name, student_name: s.name, academic_stage: s.academic_stage, avg_score: s.avg_score, exam_count: s.exam_count });
      if ((targetType === 'parents' || targetType === 'both') && s.parent_phone)
        recs.push({ student_id: s.id, phone: s.parent_phone, name: s.name, student_name: s.name, academic_stage: s.academic_stage, avg_score: s.avg_score, exam_count: s.exam_count });
    });
    return recs;
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await api.post('/whatsapp/connect');
      refetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.error || 'فشل الاتصال');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('هل تريد قطع الاتصال وحذف الجلسة؟')) return;
    try {
      await api.post('/whatsapp/disconnect');
      qc.invalidateQueries(['wa-status']);
      toast.success('تم قطع الاتصال');
    } catch { toast.error('حدث خطأ'); }
  };

  const handleSend = async () => {
    if (!message.trim()) return toast.error('اكتب نص الرسالة أولاً');
    if (selectedIds.length === 0) return toast.error('اختر طالباً واحداً على الأقل');
    // Check locally that selected students have the needed phone type — for fast UX feedback
    const recipientCount = buildRecipients().length;
    if (recipientCount === 0) {
      const missingType = targetType === 'parents' ? 'رقم ولي الأمر' : 'رقم الطالب';
      return toast.error(`المحددون لا يملكون ${missingType} مسجلاً`);
    }
    setSending(true);
    try {
      // Send only IDs + target_type — phone numbers are fetched server-side from the DB
      const res = await api.post('/whatsapp/send', {
        student_ids: selectedIds,
        target_type: targetType,
        message,
      });
      toast.success(`✅ بدأ الإرسال لـ ${res.data.total} مستلم — يعمل في الخلفية`);
      setSelectedIds([]);
      setMessage('');
    } catch (e) {
      toast.error(e.response?.data?.error || 'حدث خطأ أثناء الإرسال');
    } finally {
      setSending(false);
    }
  };

  const handleSaveSched = async (form) => {
    if (!form.name?.trim() || !form.message?.trim())
      return toast.error('الاسم والرسالة مطلوبان');
    if (!form.next_run_at)
      return toast.error('يرجى تحديد تاريخ أول إرسال');
    setSchedLoading(true);
    try {
      const payload = {
        name: form.name, message: form.message,
        target_type: form.target_type, stage_filter: form.stage_filter,
        interval_days: form.interval_days,
        next_run_at: new Date(form.next_run_at).toISOString(),
        is_active: form.is_active,
      };
      if (editSched?.id) {
        await api.put(`/whatsapp/schedules/${editSched.id}`, payload);
        toast.success('تم تعديل الجدولة ✓');
      } else {
        await api.post('/whatsapp/schedules', payload);
        toast.success('تم إنشاء الجدولة ✓');
      }
      refetchSchedules();
      setShowModal(false);
      setEditSched(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'حدث خطأ');
    } finally {
      setSchedLoading(false);
    }
  };

  const handleDeleteSched = async (id) => {
    if (!confirm('هل تريد حذف هذه الجدولة؟')) return;
    try {
      await api.delete(`/whatsapp/schedules/${id}`);
      refetchSchedules();
      toast.success('تم الحذف');
    } catch { toast.error('حدث خطأ'); }
  };

  const recipientCount = buildRecipients().length;
  const sampleStudent = students.find(s => selectedIds.includes(s.id));
  const portalLink = typeof window !== 'undefined'
    ? `${window.location.origin}/parent-portal`
    : 'رابط بوابة ولي الأمر';
  const previewMsg = sampleStudent
    ? message
        .replace(/\{name\}/g, sampleStudent.name)
        .replace(/\{student_name\}/g, sampleStudent.name)
        .replace(/\{avg_score\}/g, String(sampleStudent.avg_score || 0))
        .replace(/\{exam_count\}/g, String(sampleStudent.exam_count || 0))
        .replace(/\{stage\}/g, sampleStudent.academic_stage || '')
        .replace(/\{portal_link\}/g, portalLink)
    : message.replace(/\{portal_link\}/g, portalLink);

  const stageLabels = stages.filter(s => s !== 'all');

  const TABS = [
    ...(isTeacher ? [{ key: 'setup', icon: <Settings className="w-4 h-4" />, label: 'الإعداد' }] : []),
    { key: 'send',      icon: <Send className="w-4 h-4" />,      label: 'إرسال رسالة' },
    { key: 'schedules', icon: <AlarmClock className="w-4 h-4" />, label: 'الجدولة التلقائية' },
    { key: 'history',   icon: <History className="w-4 h-4" />,    label: 'سجل الإرسال' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-green-500 flex items-center justify-center">
            <span className="text-white font-black text-xs">WA</span>
          </div>
          <div>
            <h2 className="font-black text-navy-700 text-sm">رسائل واتساب</h2>
            <p className="text-xs text-gray-400">تواصل مع الطلاب وأولياء الأمور</p>
          </div>
        </div>
        <StatusBadge status={status || 'not_setup'} />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all ${subTab === t.key ? 'bg-green-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── SETUP TAB ── */}
      {subTab === 'setup' && isTeacher && (
        <SetupSection
          status={status || 'not_setup'} qrBase64={qrBase64}
          onConnect={handleConnect} onDisconnect={handleDisconnect}
          connecting={connecting}
        />
      )}

      {/* ── SEND TAB ── */}
      {subTab === 'send' && (
        <div className="space-y-4">
          {status !== 'connected' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-medium">
                {isTeacher
                  ? 'واتساب غير متصل — اذهب لتبويب "الإعداد" وقم بربط حسابك أولاً.'
                  : 'واتساب غير متصل — تواصل مع المعلم لربط الواتساب من إعدادات المنصة.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Students list */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-navy-700 text-sm flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-green-500" /> اختر المستلمين
                    {selectedIds.length > 0 && (
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {selectedIds.length} محدد
                      </span>
                    )}
                  </h3>
                  <button onClick={selectAll} className="text-xs font-bold text-green-600 hover:underline">
                    {selectedIds.length === filteredStudents.length && filteredStudents.length > 0 ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                </div>

                {/* Target type */}
                <div className="grid grid-cols-3 gap-1">
                  {TARGET_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => { setTargetType(t.value); setSelectedIds([]); }}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${targetType === t.value ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {t.icon} {t.short}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    className="input-field pr-9 text-sm" placeholder="بحث باسم الطالب..." />
                </div>

                {stageLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setStageFilter('all')}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${stageFilter === 'all' ? 'bg-navy-600 text-white border-navy-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                      الكل
                    </button>
                    {stageLabels.map(s => (
                      <button key={s} onClick={() => setStageFilter(s)}
                        className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${stageFilter === s ? 'bg-navy-600 text-white border-navy-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                        <GraduationCap className="w-3 h-3" /> {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="overflow-y-auto max-h-80 divide-y divide-slate-100">
                {filteredStudents.length === 0
                  ? <p className="text-center text-gray-400 py-8 text-sm">لا توجد نتائج</p>
                  : filteredStudents.map(s => {
                    const sel = selectedIds.includes(s.id);
                    const hasPhone = targetType === 'parents' ? !!s.parent_phone
                                   : targetType === 'students' ? !!s.phone
                                   : !!(s.phone || s.parent_phone);
                    return (
                      <label key={s.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all ${sel ? 'bg-green-50' : 'hover:bg-gray-50'} ${!hasPhone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={sel} disabled={!hasPhone}
                          onChange={() => hasPhone && toggleStudent(s.id)}
                          className="w-4 h-4 accent-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-navy-700 text-sm">{s.name}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-2">
                            <span>{s.academic_stage}</span>
                            {targetType !== 'students' && (
                              <span className={s.parent_phone ? 'text-green-600' : 'text-red-400'}>
                                {s.parent_phone ? '📱 ولي الأمر ✓' : '⚠️ لا يوجد رقم ولي الأمر'}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-xs text-gray-400 flex-shrink-0">
                          <span className="font-bold text-navy-600">{s.avg_score}%</span>
                        </div>
                      </label>
                    );
                  })
                }
              </div>
            </div>

            {/* Message composer */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="font-black text-navy-700 text-sm flex items-center gap-2">
                <Send className="w-4 h-4 text-green-500" /> الرسالة
              </h3>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-navy-700">نص الرسالة</label>
                  <div className="relative">
                    <button onClick={() => setTemplateOpen(v => !v)}
                      className="text-xs font-bold text-green-600 hover:underline flex items-center gap-1">
                      قوالب جاهزة <ChevronDown className="w-3 h-3" />
                    </button>
                    {templateOpen && (
                      <div className="absolute left-0 top-6 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                        {/* Parent templates */}
                        {(targetType === 'parents' || targetType === 'both') && (
                          <>
                            <div className="px-3 py-1.5 bg-blue-50 border-b border-slate-100">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">👨‍👩‍👧 قوالب أولياء الأمور</p>
                            </div>
                            {WA_PARENT_TEMPLATES.map(t => (
                              <button key={t.title} onClick={() => { setMessage(t.text); setTemplateOpen(false); }}
                                className="w-full text-right px-3 py-2.5 hover:bg-green-50 transition-colors border-b border-slate-100 last:border-0">
                                <p className="text-xs font-bold text-navy-700">{t.title}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{t.text.substring(0, 60)}...</p>
                              </button>
                            ))}
                          </>
                        )}
                        {/* Student templates */}
                        {(targetType === 'students' || targetType === 'both') && (
                          <>
                            <div className="px-3 py-1.5 bg-emerald-50 border-b border-slate-100">
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">👤 قوالب الطلاب</p>
                            </div>
                            {WA_STUDENT_TEMPLATES.map(t => (
                              <button key={t.title} onClick={() => { setMessage(t.text); setTemplateOpen(false); }}
                                className="w-full text-right px-3 py-2.5 hover:bg-green-50 transition-colors border-b border-slate-100 last:border-0">
                                <p className="text-xs font-bold text-navy-700">{t.title}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{t.text.substring(0, 60)}...</p>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  className="input-field h-40 resize-none text-sm" dir="rtl"
                  placeholder="اكتب الرسالة هنا... أو اختر قالباً جاهزاً من الأعلى" />
                <p className="text-xs text-gray-400 mt-1">
                  المتغيرات: &#123;student_name&#125; &#123;avg_score&#125; &#123;exam_count&#125; &#123;stage&#125;
                  {(targetType === 'parents' || targetType === 'both') && (
                    <> · &#123;portal_link&#125; <span className="text-blue-500">(رابط بوابة ولي الأمر)</span></>
                  )}
                </p>
              </div>

              {message && selectedIds.length > 0 && sampleStudent && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-green-700 mb-2">👁 معاينة (لـ {sampleStudent.name}):</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{previewMsg}</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
                <p className="font-bold text-navy-700">ملخص الإرسال:</p>
                <p>📋 الطلاب المحددون: <span className="font-bold">{selectedIds.length}</span></p>
                <p>📱 إجمالي الرسائل: <span className="font-bold text-green-700">{recipientCount}</span>
                  {recipientCount === 0 && selectedIds.length > 0 && (
                    <span className="text-red-500"> (لا يوجد أرقام مسجلة)</span>
                  )}
                </p>
                <p>⏱ الوقت التقريبي: <span className="font-bold">
                  {recipientCount <= 1
                    ? '< دقيقة'
                    : `${Math.ceil((recipientCount - 1) * 12 / 60)} دقيقة`}
                </span></p>
              </div>

              <button onClick={handleSend} disabled={sending || status !== 'connected'}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-black text-sm transition-all shadow-sm">
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                إرسال لـ {recipientCount} مستلم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULES TAB ── */}
      {subTab === 'schedules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">رسائل تُرسل تلقائياً حسب الجدول المحدد</p>
            <button onClick={() => { setEditSched(null); setShowModal(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm">
              <Plus className="w-4 h-4" /> جدولة جديدة
            </button>
          </div>

          {status !== 'connected' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-medium">
                الجدولة تعمل فقط عند اتصال واتساب.
                {isTeacher ? ' اذهب لتبويب الإعداد لربط الواتساب.' : ' تواصل مع المعلم لتفعيل الربط.'}
              </p>
            </div>
          )}

          {schedules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center py-12">
              <AlarmClock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium text-sm">لا توجد جدولات بعد</p>
              <p className="text-gray-400 text-xs mt-1">أنشئ جدولة لإرسال تقارير دورية تلقائياً</p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h4 className="font-black text-navy-700 text-sm">{s.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${s.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {s.is_active ? '● نشط' : '○ متوقف'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 border border-blue-200">
                          {TARGET_OPTIONS.find(t => t.value === s.target_type)?.label}
                        </span>
                        {s.stage_filter !== 'all' && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 border border-purple-200">
                            {s.stage_filter}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{s.message}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDaysLabel(s.interval_days)}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> الإرسال القادم: {fmtDate(s.next_run_at)}</span>
                        {s.last_run_at && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> آخر إرسال: {fmtDate(s.last_run_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setEditSched(s); setShowModal(true); }}
                        className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 transition-all"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteSched(s.id)}
                        className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {subTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-navy-700 text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" /> سجل الإرسال
            </h3>
            <button onClick={refetchLogs} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-all"><RefreshCw className="w-4 h-4" /></button>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">لا يوجد سجل إرسال بعد</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {log.status === 'done'
                        ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : log.status === 'failed'
                        ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        : <Loader2 className="w-4 h-4 text-orange-400 animate-spin flex-shrink-0" />}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                        log.send_type === 'scheduled'
                          ? 'bg-purple-100 text-purple-700 border-purple-200'
                          : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                        {log.send_type === 'scheduled' ? '⏰ تلقائي' : '✋ يدوي'}
                      </span>
                      {log.schedule_name && (
                        <span className="text-xs text-gray-500 font-medium">{log.schedule_name}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{fmtDate(log.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">{log.message}</p>
                  <div className="flex gap-3 text-xs">
                    <span className="text-gray-500">الإجمالي: <span className="font-bold text-navy-700">{log.total_count}</span></span>
                    <span className="text-green-600">نجح: <span className="font-bold">{log.success_count}</span></span>
                    {log.fail_count > 0 && <span className="text-red-500">فشل: <span className="font-bold">{log.fail_count}</span></span>}
                    {log.status === 'sending' && <span className="text-orange-500 font-bold animate-pulse">جاري الإرسال...</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      {showModal && (
        <ScheduleModal
          schedule={editSched}
          stages={stageLabels}
          onSave={handleSaveSched}
          onClose={() => { setShowModal(false); setEditSched(null); }}
          loading={schedLoading}
        />
      )}
    </div>
  );
}
