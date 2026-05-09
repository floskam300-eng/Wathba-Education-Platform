import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Clock, Users, Search, ChevronDown, GraduationCap, Filter } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const TEMPLATES = [
  { label: 'نتيجة اختبار', text: 'مرحباً {name}، نتيجتك في الاختبار الأخير جاهزة. تفضل/ي بتسجيل الدخول لمعرفة نتيجتك.' },
  { label: 'تذكير بالاختبار', text: 'مرحباً {name}، تذكير: لديك اختبار قريباً. احرص/ي على المذاكرة الجيدة. 📚' },
  { label: 'تذكير بالمدفوعات', text: 'مرحباً {name}، يرجى سداد رسوم الكورس في أقرب وقت ممكن. للاستفسار تواصل معنا.' },
  { label: 'رسالة تشجيعية', text: 'مرحباً {name}، أداؤك رائع! استمر/ي في التقدم. أنت تستطيع تحقيق المزيد. 🌟' },
  { label: 'تنبيه لولي الأمر', text: 'مرحباً، هذه رسالة بخصوص الطالب/ة {name}. يرجى التواصل مع المعلم لمتابعة الأداء الدراسي.' },
  { label: 'بداية الكورس', text: 'مرحباً {name}، تم فتح الكورس الجديد. تفضل/ي بتسجيل الدخول والبدء في المشاهدة. 🎓' },
];

const fmtPhone = (phone) => {
  if (!phone) return null;
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '2' + p;
  return p;
};

export default function Notifications() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState('student');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [tab, setTab] = useState('send');

  const { data: students = [] } = useQuery({
    queryKey: ['notif-students'],
    queryFn: () => api.get('/notifications/students').then(r => r.data),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['notif-logs'],
    queryFn: () => api.get('/notifications/log').then(r => r.data),
    enabled: tab === 'history',
  });

  const logMut = useMutation({
    mutationFn: (data) => api.post('/notifications/log', data),
    onSuccess: () => qc.invalidateQueries(['notif-logs']),
  });

  const stages = ['الكل', ...new Set(students.map(s => s.academic_stage).filter(Boolean))];

  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search) || (s.phone || '').includes(search);
    const matchStage = stageFilter === 'الكل' || s.academic_stage === stageFilter;
    return matchSearch && matchStage;
  });

  const toggleStudent = (id) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedStudents.length === filtered.length && filtered.length > 0) setSelectedStudents([]);
    else setSelectedStudents(filtered.map(s => s.id));
  };

  const selectStageAll = (stage) => {
    const stageStudents = students.filter(s => s.academic_stage === stage).map(s => s.id);
    setStageFilter(stage);
    setSelectedStudents(stageStudents);
  };

  const applyTemplate = (tpl) => {
    setMessage(tpl.text);
    setTemplateOpen(false);
  };

  const sendMessages = () => {
    if (!message.trim()) return toast.error('اكتب الرسالة أولاً');
    if (selectedStudents.length === 0) return toast.error('اختر طالباً واحداً على الأقل');

    const targets = students.filter(s => selectedStudents.includes(s.id));
    let sent = 0;

    targets.forEach(s => {
      const phone = recipientType === 'parent' ? s.parent_phone : s.phone;
      const fmted = fmtPhone(phone);
      if (!fmted) return;

      const personalMsg = message.replace('{name}', s.name);
      const url = `https://wa.me/${fmted}?text=${encodeURIComponent(personalMsg)}`;
      window.open(url, '_blank');

      logMut.mutate({
        student_id: s.id,
        recipient_phone: phone,
        recipient_type: recipientType,
        message: personalMsg,
      });
      sent++;
    });

    if (sent > 0) {
      toast.success(`تم فتح ${sent} محادثة واتساب`);
      setSelectedStudents([]);
    } else {
      toast.error('لا توجد أرقام هواتف للطلاب المختارين');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <MessageCircle className="w-7 h-7 text-green-500" /> الإشعارات والرسائل
        </h1>
      </div>

      <div className="flex gap-2 bg-white rounded-xl border border-slate-200 p-1 w-fit shadow-sm">
        {[['send', 'إرسال رسائل'], ['history', 'سجل الإرسال']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-navy-500 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'send' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Student picker */}
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
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="input-field pr-9 text-sm" placeholder="بحث باسم الطالب أو الهاتف..." />
              </div>

              {stages.length > 1 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-xs font-bold text-gray-500">
                    <Filter className="w-3 h-3" /> فلتر حسب المرحلة
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map(stage => {
                      const count = stage === 'الكل'
                        ? students.length
                        : students.filter(s => s.academic_stage === stage).length;
                      const isActive = stageFilter === stage;
                      return (
                        <button
                          key={stage}
                          onClick={() => {
                            if (stage !== 'الكل') {
                              selectStageAll(stage);
                            } else {
                              setStageFilter('الكل');
                              setSelectedStudents([]);
                            }
                          }}
                          className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all border ${
                            isActive
                              ? 'bg-navy-600 text-white border-navy-600'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}>
                          {stage !== 'الكل' && <GraduationCap className="w-3 h-3" />}
                          {stage}
                          <span className={`text-xs rounded-full px-1 font-black ${isActive ? 'bg-white/20 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {stageFilter !== 'الكل' && (
                    <p className="text-xs text-orange-600 font-bold">
                      ✓ تم تحديد جميع طلاب {stageFilter} تلقائياً — يمكنك تعديل التحديد
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="overflow-y-auto max-h-80 divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">لا توجد نتائج</p>
              ) : filtered.map(s => {
                const selected = selectedStudents.includes(s.id);
                const hasPhone = recipientType === 'parent' ? !!s.parent_phone : !!s.phone;
                return (
                  <label key={s.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${selected ? 'bg-orange-50' : 'hover:bg-gray-50'} ${!hasPhone ? 'opacity-50' : ''}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleStudent(s.id)}
                      className="w-4 h-4 accent-orange-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-navy-700 text-sm">{s.name}</p>
                      <p className="text-xs text-gray-500">
                        {recipientType === 'parent'
                          ? (s.parent_phone || 'لا يوجد رقم ولي أمر')
                          : (s.phone || 'لا يوجد رقم')}
                      </p>
                    </div>
                    {!hasPhone && <span className="text-xs text-red-400 font-bold">لا رقم</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Message composer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-navy-600 flex items-center gap-2">
              <Send className="w-4 h-4 text-green-500" /> كتابة الرسالة
            </h2>

            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">إرسال إلى</label>
              <div className="flex gap-2">
                {[['student', '📱 الطالب'], ['parent', '👨‍👩‍👧 ولي الأمر']].map(([val, label]) => (
                  <button key={val} onClick={() => setRecipientType(val)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border-2 ${recipientType === val ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-bold text-navy-700">نص الرسالة</label>
                <div className="relative">
                  <button onClick={() => setTemplateOpen(!templateOpen)}
                    className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1">
                    قوالب جاهزة <ChevronDown className="w-3 h-3" />
                  </button>
                  {templateOpen && (
                    <div className="absolute left-0 top-6 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                      {TEMPLATES.map(t => (
                        <button key={t.label} onClick={() => applyTemplate(t)}
                          className="w-full text-right px-3 py-2.5 text-xs font-semibold text-navy-700 hover:bg-orange-50 transition-colors border-b border-slate-100 last:border-0">
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                className="input-field h-32 resize-none text-sm"
                placeholder="اكتب رسالتك هنا... يمكنك استخدام {name} وسيُستبدل باسم الطالب تلقائياً" />
              <p className="text-xs text-gray-400 mt-1">استخدم &#123;name&#125; لإدراج اسم الطالب تلقائياً</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 font-medium">
              <p className="font-bold mb-1">🟢 كيف يعمل الإرسال؟</p>
              <p>سيفتح التطبيق نافذة واتساب لكل طالب مختار، وستحتاج فقط للضغط على "إرسال" في كل محادثة.</p>
            </div>

            <button onClick={sendMessages}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700">
              <MessageCircle className="w-5 h-5" />
              إرسال عبر واتساب ({selectedStudents.length} طالب)
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-black text-navy-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" /> سجل الرسائل المرسلة
            </h2>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">لم يتم إرسال أي رسائل بعد</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-navy-700 text-sm">{log.student_name || 'طالب'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${log.recipient_type === 'parent' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {log.recipient_type === 'parent' ? 'ولي أمر' : 'طالب'}
                        </span>
                        <span className="text-xs text-gray-400">{log.recipient_phone}</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{log.message}</p>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                      {new Date(log.sent_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
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
