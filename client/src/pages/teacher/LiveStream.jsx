import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStream } from '../../context/LiveStreamContext';
import JitsiMeet from '../../components/JitsiMeet';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Radio, Users, MessageSquare, StopCircle, Send, X,
  MessageCircleOff, MessageCircle, Loader2, Star, Trophy,
  ChevronLeft,
} from 'lucide-react';

/* ── Elapsed timer ─────────────────────────────────────────── */
function useElapsed(startedAt) {
  const [elapsed, setElapsed] = useState('00:00');
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(`${h ? String(h).padStart(2,'0')+':' : ''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return elapsed;
}

function Toggle({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 rounded-full overflow-hidden transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 flex-shrink-0 ${on ? 'bg-green-500' : 'bg-slate-400 dark:bg-slate-600'}`}
    >
      <span
        className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

/* ── Student row (viewer list) ─────────────────────────────── */
function StudentRow({ viewer, streamId, onRefresh }) {
  const [awarding, setAwarding] = useState(false);
  const [pts, setPts]           = useState(5);
  const [reason, setReason]     = useState('');
  const [loading, setLoading]   = useState(false);

  const handleAward = async () => {
    const p = parseInt(pts);
    if (!p || p < 1) return;
    setLoading(true);
    try {
      await api.post(`/live/${streamId}/award-points`, {
        studentId: viewer.id, points: p, reason: reason || undefined,
      });
      toast.success(`✅ تم منح ${p} نقطة لـ ${viewer.name}`);
      setAwarding(false); setPts(5); setReason('');
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في منح النقاط');
    } finally { setLoading(false); }
  };

  return (
    <div className={`rounded-xl p-3 border transition-all mb-2 ${viewer.hand_raised ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${viewer.hand_raised ? 'bg-yellow-500' : 'bg-navy-600'}`}>
          {viewer.name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{viewer.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{viewer.academic_stage || 'غير محدد'} · {viewer.points ?? 0} نقطة</p>
        </div>
        {viewer.hand_raised && (
          <span className="text-xs font-black text-yellow-700 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-300 px-2 py-0.5 rounded-full flex-shrink-0 animate-pulse">
            ✋ يده مرفوعة
          </span>
        )}
      </div>

      {!awarding ? (
        <button onClick={() => setAwarding(true)}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors">
          <Trophy className="w-3.5 h-3.5" /> منح نقاط
        </button>
      ) : (
        <div className="space-y-2 mt-1">
          <div className="flex gap-1.5">
            <input type="number" min="1" max="500" value={pts} onChange={e => setPts(e.target.value)}
              className="w-16 text-center text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-800 dark:text-white" />
            <input type="text" placeholder="السبب (اختياري)" value={reason} onChange={e => setReason(e.target.value)}
              className="flex-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleAward} disabled={loading}
              className="flex-1 flex items-center justify-center gap-1 text-xs font-bold py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white disabled:opacity-50">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />} تأكيد
            </button>
            <button onClick={() => { setAwarding(false); setReason(''); setPts(5); }}
              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Viewers panel ─────────────────────────────────────────── */
function ViewersPanel({ streamId, dark }) {
  const { data, refetch } = useQuery({
    queryKey: ['live-viewers', streamId],
    queryFn:  () => api.get(`/live/${streamId}/viewers`).then(r => r.data.viewers),
    refetchInterval: 6000,
    enabled:  !!streamId,
  });
  const viewers = data || [];
  const raised  = viewers.filter(v => v.hand_raised).length;

  useEffect(() => {
    const h = () => refetch();
    window.addEventListener('wathba_live_hand_raise',    h);
    window.addEventListener('wathba_live_viewer_update', h);
    return () => {
      window.removeEventListener('wathba_live_hand_raise',    h);
      window.removeEventListener('wathba_live_viewer_update', h);
    };
  }, [refetch]);

  return (
    <div className="flex flex-col h-full">
      <div className={`px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <span className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>الحضور</span>
          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-black">{viewers.length}</span>
        </div>
        {raised > 0 && (
          <span className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 px-2 py-0.5 rounded-full font-black animate-pulse">
            ✋ {raised} يد مرفوعة
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {viewers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>لا يوجد طلاب بعد</p>
            <p className={`text-xs mt-1 ${dark ? 'text-slate-600' : 'text-slate-300'}`}>سيظهرون عند الانضمام</p>
          </div>
        ) : (
          [...viewers]
            .sort((a, b) => (b.hand_raised ? 1 : 0) - (a.hand_raised ? 1 : 0))
            .map(v => <StudentRow key={v.id} viewer={v} streamId={streamId} onRefresh={refetch} />)
        )}
      </div>
    </div>
  );
}

/* ── Chat panel ────────────────────────────────────────────── */
function ChatPanel({ stream, teacherName, dark }) {
  const [messages, setMessages]         = useState([]);
  const [text, setText]                 = useState('');
  const [chatEnabled, setChatEnabled]   = useState(stream.chat_enabled !== false);
  const [sending, setSending]           = useState(false);
  const bottomRef = useRef(null);

  useQuery({
    queryKey: ['live-chat', stream.id],
    queryFn:  async () => {
      const r = await api.get(`/live/${stream.id}/chat`);
      setMessages(r.data.messages || []);
      return r.data.messages;
    },
    refetchInterval: 3500,
    enabled: !!stream.id,
  });

  useEffect(() => {
    const h = (e) => {
      const msg = e.detail;
      if (String(msg.stream_id) === String(stream.id))
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    };
    window.addEventListener('wathba_live_chat', h);
    return () => window.removeEventListener('wathba_live_chat', h);
  }, [stream.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleChat = async () => {
    const next = !chatEnabled;
    try {
      await api.post(`/live/${stream.id}/chat-toggle`, { enabled: next });
      setChatEnabled(next);
      toast(next ? '💬 الدردشة مفعلة' : '🔇 الدردشة معطلة', { duration: 3000, style: { fontFamily: 'inherit', direction: 'rtl' } });
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل تغيير حالة الدردشة');
    }
  };

  const sendMsg = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/live/${stream.id}/chat`, { message: text.trim() });
      setText('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل الإرسال');
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className={`px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-500" />
          <span className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>الدردشة</span>
        </div>
        <button onClick={toggleChat}
          className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors ${chatEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {chatEnabled ? <MessageCircle className="w-3.5 h-3.5" /> : <MessageCircleOff className="w-3.5 h-3.5" />}
          {chatEnabled ? 'مفعلة' : 'معطلة'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد رسائل</p>
          </div>
        ) : messages.map(msg => (
          <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.sender_type === 'teacher' ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-slate-400 px-1">{msg.sender_name}</span>
            <div className={`text-sm px-3 py-2 rounded-2xl max-w-[90%] leading-relaxed ${
              msg.sender_type === 'teacher'
                ? 'bg-navy-600 text-white rounded-bl-sm'
                : dark ? 'bg-slate-700 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-br-sm'
            }`}>{msg.message}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={`p-3 border-t flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
            placeholder="اكتب رسالة..."
            className={`flex-1 text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-500 ${dark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800'}`} />
          <button onClick={sendMsg} disabled={!text.trim() || sending}
            className="p-2.5 bg-navy-600 hover:bg-navy-700 text-white rounded-xl disabled:opacity-50 transition-colors">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Live view ─────────────────────────────────────────────── */
function LiveView({ stream, user, dark, onEnd }) {
  const [tab, setTab]       = useState('students');
  const [ending, setEnding] = useState(false);
  const elapsed             = useElapsed(stream.started_at);

  const handleEnd = async () => {
    if (!window.confirm('إنهاء البث المباشر الآن؟')) return;
    setEnding(true);
    try {
      await api.post(`/live/${stream.id}/end`);
      toast.success('انتهى البث المباشر');
      onEnd();
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في إنهاء البث');
      setEnding(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
           style={{ backgroundColor: '#1a0000', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-full flex-shrink-0 animate-pulse">
            <Radio className="w-3 h-3" /> مباشر
          </span>
          <span className="text-white font-bold text-sm truncate">{stream.title}</span>
          <span className="text-red-300 text-xs font-mono flex-shrink-0 hidden sm:block">{elapsed}</span>
        </div>
        <button onClick={handleEnd} disabled={ending}
          className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white transition-colors disabled:opacity-60 flex-shrink-0">
          {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
          إنهاء البث
        </button>
      </div>

      {/* Body: Jitsi + Sidebar — stacked on mobile, side-by-side on md+ */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        {/* Video area: aspect-video on mobile, flex-1 on desktop */}
        <div className="bg-black overflow-hidden flex-shrink-0 md:flex-1 aspect-video md:aspect-auto">
          <JitsiMeet
            roomName={stream.room_id}
            displayName={user?.name || 'المعلم'}
            isTeacher
            onLeft={onEnd}
            style={{ height: '100%', width: '100%' }}
          />
        </div>

        {/* Sidebar: fixed-height on mobile, full-height on desktop */}
        <div className={`flex flex-col flex-shrink-0 w-full h-[42vh] md:h-auto md:w-72 xl:w-80 border-t md:border-t-0 md:border-r ${dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`flex border-b flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
            {[
              { key: 'students', label: 'الطلاب',  icon: Users },
              { key: 'chat',     label: 'الدردشة', icon: MessageSquare },
            ].map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold border-b-2 transition-colors ${
                  tab === key
                    ? 'border-red-500 text-red-600'
                    : `border-transparent ${dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`
                }`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === 'students' && <ViewersPanel streamId={stream.id} dark={dark} />}
            {tab === 'chat'     && <ChatPanel stream={stream} teacherName={user?.name} dark={dark} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stages multi-select ───────────────────────────────────── */
function StagesSelector({ selected, onChange, dark }) {
  const { data, isLoading } = useQuery({
    queryKey: ['teacher-stages'],
    queryFn:  () => api.get('/students/stages').then(r => r.data.stages),
    staleTime: 60000,
  });
  const stages = data || [];

  const toggle = (s) =>
    onChange(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm py-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل الصفوف...
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <p className={`text-sm py-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
        لا توجد صفوف مسجلة حتى الآن — أضف طلاباً أولاً.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {stages.map(s => {
        const isOn = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border text-right transition-all ${
              isOn
                ? 'bg-red-600 text-white border-red-600'
                : dark
                  ? 'border-slate-600 text-slate-300 hover:border-red-400 bg-slate-800/40'
                  : 'border-slate-300 text-slate-600 hover:border-red-400 bg-white'
            }`}
          >
            <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${isOn ? 'border-white bg-white' : dark ? 'border-slate-500' : 'border-slate-300'}`}>
              {isOn && <span className="w-2 h-2 rounded-sm bg-red-600 block" />}
            </span>
            <span className="truncate">{s}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Stream form ───────────────────────────────────────────── */
function StreamForm({ onBack, onStarted, dark }) {
  const [title, setTitle]         = useState('');
  const [desc, setDesc]           = useState('');
  const [access, setAccess]       = useState('all');
  const [selStages, setSelStages] = useState([]);
  const [chatOn, setChatOn]       = useState(true);
  const [handOn, setHandOn]       = useState(true);
  const [loading, setLoading]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('أدخل عنوان البث'); return; }
    if (access === 'stages' && selStages.length === 0) {
      toast.error('اختر صفاً واحداً على الأقل'); return;
    }
    setLoading(true);
    try {
      const r = await api.post('/live/start', {
        title: title.trim(), description: desc.trim(),
        access, allowed_stages: access === 'stages' ? selStages : [],
        chat_enabled: chatOn, hand_raise_enabled: handOn,
      });
      toast.success('🎙️ انطلق البث!');
      onStarted(r.data.stream);
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في بدء البث');
      setLoading(false);
    }
  };

  const inp = `w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition-shadow ${dark ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'}`;

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack} className={`p-2 rounded-xl transition-colors ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className={`text-xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>إعداد البث المباشر</h2>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>ضبط خصائص الجلسة المباشرة</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>عنوان البث <span className="text-red-500">*</span></label>
          <input className={inp} placeholder="مثال: مراجعة الفصل الثالث" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>وصف الجلسة</label>
          <textarea className={inp} rows={2} placeholder="ماذا ستشرح في هذه الجلسة؟" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>

        <div>
          <label className={`block text-sm font-bold mb-2 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>من يستطيع المشاهدة؟</label>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'all', l: '📢 كل الطلاب' }, { v: 'stages', l: '📚 مراحل محددة' }].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setAccess(v)}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${access === v ? 'bg-red-600 text-white border-red-600' : dark ? 'border-slate-600 text-slate-300 hover:border-red-400' : 'border-slate-300 text-slate-600 hover:border-red-400'}`}>
                {l}
              </button>
            ))}
          </div>
          {access === 'stages' && (
            <div className={`mt-3 rounded-xl border p-3 ${dark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
              <p className={`text-xs font-bold mb-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                اختر الصفوف المسموح لها بالمشاهدة
                {selStages.length > 0 && <span className="mr-2 text-red-500">({selStages.length} مختار)</span>}
              </p>
              <StagesSelector selected={selStages} onChange={setSelStages} dark={dark} />
            </div>
          )}
        </div>

        <div className={`rounded-xl border p-4 space-y-4 ${dark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>تفعيل الدردشة</p>
              <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>السماح للطلاب بإرسال رسائل</p>
            </div>
            <Toggle on={chatOn} onClick={() => setChatOn(p => !p)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>رفع اليد</p>
              <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>السماح للطلاب برفع أيديهم</p>
            </div>
            <Toggle on={handOn} onClick={() => setHandOn(p => !p)} />
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white text-base bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-all shadow-lg active:scale-[0.98]">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5" />}
          {loading ? 'جارٍ البدء...' : 'ابدأ البث الآن'}
        </button>
      </form>
    </div>
  );
}

/* ── Idle view ─────────────────────────────────────────────── */
function IdleView({ onNew, dark }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
           style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.25)' }}>
        <Radio className="w-10 h-10 text-red-500" />
      </div>
      <h2 className={`text-2xl font-black mb-2 ${dark ? 'text-white' : 'text-slate-800'}`}>البث المباشر</h2>
      <p className={`text-sm mb-8 max-w-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
        تواصل مع طلابك مباشرةً — أدِر الدردشة، شاهد من يريد الإجابة، وامنح النقاط فوراً.
      </p>
      <button onClick={onNew}
        className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-white text-base bg-red-600 hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/25 active:scale-95">
        <Radio className="w-5 h-5" /> ابدأ بثاً جديداً
      </button>
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────── */
export default function TeacherLiveStream() {
  const { dark }  = useTheme();
  const { user }  = useAuth();
  const { startTeacherStream, endTeacherStream } = useLiveStream();
  const [view, setView]     = useState('loading');
  const [stream, setStream] = useState(null);

  useEffect(() => {
    api.get('/live/my-active')
      .then(r => {
        if (r.data.stream) {
          setStream(r.data.stream);
          startTeacherStream(r.data.stream);
          setView('live');
        } else {
          setView('idle');
        }
      })
      .catch(() => setView('idle'));
  }, []);

  const handleStarted = (s) => { setStream(s); startTeacherStream(s); setView('live'); };
  const handleEnded   = () => { endTeacherStream(); setStream(null); setView('idle'); };

  if (view === 'loading') {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;
  }

  if (view === 'live' && stream) {
    return (
      <div className="overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        <LiveView stream={stream} user={user} dark={dark} onEnd={handleEnded} />
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {view === 'form'
        ? <StreamForm dark={dark} onBack={() => setView('idle')} onStarted={handleStarted} />
        : <IdleView dark={dark} onNew={() => setView('form')} />
      }
    </div>
  );
}
