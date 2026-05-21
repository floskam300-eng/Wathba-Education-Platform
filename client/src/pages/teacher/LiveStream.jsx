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
  ChevronLeft, Circle, Video, Calendar, Clock, Trash2, Play, RefreshCw,
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
      className={`relative inline-flex h-6 w-11 rounded-full overflow-hidden transition-colors duration-200 focus:outline-none flex-shrink-0 ${on ? 'bg-green-500' : 'bg-slate-400 dark:bg-slate-600'}`}
    >
      <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-6' : 'translate-x-1'}`} />
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
      await api.post(`/live/${streamId}/award-points`, { studentId: viewer.id, points: p, reason: reason || undefined });
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
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${viewer.hand_raised ? 'bg-yellow-500' : 'bg-purple-600'}`}>
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
                ? 'bg-purple-600 text-white rounded-bl-sm'
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
            className={`flex-1 text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 ${dark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800'}`} />
          <button onClick={sendMsg} disabled={!text.trim() || sending}
            className="p-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl disabled:opacity-50 transition-colors">
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

  // ── Screen recording ────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);
  const captureRef   = useRef(null);

  const startRecording = async () => {
    try {
      const captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      captureRef.current = captureStream;
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(captureStream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const date = new Date().toLocaleDateString('ar-EG').replace(/\//g, '-');
        a.download = `بث-${stream.title}-${date}.webm`;
        a.href     = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        setRecording(false);
        toast.success('✅ تم حفظ التسجيل على جهازك', { style: { fontFamily: 'inherit', direction: 'rtl' } });
      };
      captureStream.getVideoTracks()[0].addEventListener('ended', () => {
        if (recorder.state === 'recording') recorder.stop();
      });
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      toast.success('🔴 بدأ التسجيل — اختر هذا التبويب أو نافذة المتصفح', {
        duration: 5000, style: { fontFamily: 'inherit', direction: 'rtl' },
      });
    } catch (err) {
      if (err.name !== 'NotAllowedError') toast.error('تعذّر بدء التسجيل');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    captureRef.current?.getTracks().forEach(t => t.stop());
  };

  // Stop recording on unmount
  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    captureRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const handleEnd = async () => {
    if (!window.confirm('إنهاء البث المباشر الآن؟')) return;
    setEnding(true);
    if (recording) stopRecording();
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
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 gap-2"
           style={{ backgroundColor: '#1a0000', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 bg-red-600 text-white text-[11px] font-black px-2 py-1 rounded-full flex-shrink-0 animate-pulse">
            <Radio className="w-2.5 h-2.5" /> مباشر
          </span>
          <span className="text-white font-bold text-xs sm:text-sm truncate">{stream.title}</span>
          <span className="text-red-300 text-xs font-mono flex-shrink-0 hidden sm:block">{elapsed}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Recording button */}
          {recording ? (
            <button onClick={stopRecording}
              className="flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors animate-pulse">
              <Circle className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">إيقاف وتنزيل</span>
            </button>
          ) : (
            <button onClick={startRecording}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="تسجيل البث — سيُحفظ على جهازك">
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تسجيل</span>
            </button>
          )}
          {/* End stream button */}
          <button onClick={handleEnd} disabled={ending}
            className="flex items-center gap-1.5 text-xs font-black px-2.5 sm:px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white transition-colors disabled:opacity-60">
            {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">إنهاء البث</span>
          </button>
        </div>
      </div>

      {/* Body: Jitsi + Sidebar */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        <div className="bg-black overflow-hidden flex-shrink-0 md:flex-1 aspect-video md:aspect-auto">
          <JitsiMeet
            roomName={stream.room_id}
            displayName={user?.name || 'المعلم'}
            isTeacher
            style={{ height: '100%', width: '100%' }}
          />
        </div>
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

  if (isLoading) return (
    <div className={`flex items-center gap-2 text-sm py-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
      <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل الصفوف...
    </div>
  );
  if (stages.length === 0) return (
    <p className={`text-sm py-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد صفوف مسجلة حتى الآن.</p>
  );

  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {stages.map(s => {
        const isOn = selected.includes(s);
        return (
          <button key={s} type="button" onClick={() => toggle(s)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border text-right transition-all ${
              isOn
                ? 'bg-red-600 text-white border-red-600'
                : dark
                  ? 'border-slate-600 text-slate-300 hover:border-red-400 bg-slate-800/40'
                  : 'border-slate-300 text-slate-600 hover:border-red-400 bg-white'
            }`}>
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

/* ── Scheduled stream card (teacher) ──────────────────────── */
function ScheduledStreamCard({ stream, dark, onStart, onCancel, starting }) {
  const [timeLabel, setTimeLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(stream.scheduled_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLabel('جاهز للبدء الآن!'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLabel(h > 0
        ? `${h}س ${String(m).padStart(2,'0')}د`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [stream.scheduled_at]);

  const dateStr = new Date(stream.scheduled_at).toLocaleString('ar-EG', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`rounded-2xl border p-4 ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(139,92,246,0.12)', border: '2px solid rgba(139,92,246,0.25)' }}>
          <Calendar className="w-5 h-5 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-black text-sm truncate ${dark ? 'text-white' : 'text-slate-800'}`}>{stream.title}</h4>
          <p className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{dateStr}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Clock className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
            <span className="text-xs font-black text-purple-500 font-mono">{timeLabel}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button onClick={onStart} disabled={starting}
            className="flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-60">
            {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            ابدأ
          </button>
          <button onClick={onCancel}
            className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            <Trash2 className="w-3.5 h-3.5" /> إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Stream form (start now) ───────────────────────────────── */
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
    if (access === 'stages' && selStages.length === 0) { toast.error('اختر صفاً واحداً على الأقل'); return; }
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

/* ── Schedule form (future stream) ────────────────────────── */
function ScheduleForm({ onBack, onScheduled, dark }) {
  const [title, setTitle]             = useState('');
  const [desc, setDesc]               = useState('');
  const [access, setAccess]           = useState('all');
  const [selStages, setSelStages]     = useState([]);
  const [chatOn, setChatOn]           = useState(true);
  const [handOn, setHandOn]           = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading]         = useState(false);

  const minDT = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('أدخل عنوان البث'); return; }
    if (!scheduledAt)  { toast.error('حدد موعد البث'); return; }
    if (new Date(scheduledAt).getTime() <= Date.now()) { toast.error('يجب أن يكون الموعد في المستقبل'); return; }
    if (access === 'stages' && selStages.length === 0) { toast.error('اختر صفاً واحداً على الأقل'); return; }
    setLoading(true);
    try {
      await api.post('/live/schedule', {
        title: title.trim(), description: desc.trim(),
        access, allowed_stages: access === 'stages' ? selStages : [],
        chat_enabled: chatOn, hand_raise_enabled: handOn,
        scheduled_at: new Date(scheduledAt).toISOString(),
      });
      toast.success('📅 تم جدولة البث بنجاح!', { style: { fontFamily: 'inherit', direction: 'rtl' } });
      onScheduled();
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في جدولة البث');
      setLoading(false);
    }
  };

  const inp = `w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-shadow ${dark ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'}`;

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack} className={`p-2 rounded-xl transition-colors ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className={`text-xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>جدولة بث مستقبلي</h2>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>حدد موعداً وسيظهر للطلاب مسبقاً مع عدّاد تنازلي</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>موعد البث <span className="text-red-500">*</span></label>
          <input type="datetime-local" className={inp} min={minDT} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
        </div>
        <div>
          <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>عنوان البث <span className="text-red-500">*</span></label>
          <input className={inp} placeholder="مثال: مراجعة الفصل الثالث" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>وصف الجلسة</label>
          <textarea className={inp} rows={2} placeholder="ماذا ستشرح؟" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div>
          <label className={`block text-sm font-bold mb-2 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>من يستطيع المشاهدة؟</label>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'all', l: '📢 كل الطلاب' }, { v: 'stages', l: '📚 مراحل محددة' }].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setAccess(v)}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${access === v ? 'bg-purple-600 text-white border-purple-600' : dark ? 'border-slate-600 text-slate-300 hover:border-purple-400' : 'border-slate-300 text-slate-600 hover:border-purple-400'}`}>
                {l}
              </button>
            ))}
          </div>
          {access === 'stages' && (
            <div className={`mt-3 rounded-xl border p-3 ${dark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
              <StagesSelector selected={selStages} onChange={setSelStages} dark={dark} />
            </div>
          )}
        </div>
        <div className={`rounded-xl border p-4 space-y-4 ${dark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>تفعيل الدردشة</p>
            <Toggle on={chatOn} onClick={() => setChatOn(p => !p)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>رفع اليد</p>
            <Toggle on={handOn} onClick={() => setHandOn(p => !p)} />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white text-base bg-purple-600 hover:bg-purple-700 disabled:opacity-60 transition-all shadow-lg active:scale-[0.98]">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
          {loading ? 'جارٍ الجدولة...' : 'جدول البث'}
        </button>
      </form>
    </div>
  );
}

/* ── Idle view ─────────────────────────────────────────────── */
function IdleView({ onGoToForm, onSchedule, onStarted, dark }) {
  const [starting, setStarting] = useState(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['live-scheduled-teacher'],
    queryFn: () => api.get('/live/scheduled').then(r => r.data.streams),
    refetchInterval: 30000,
  });
  const scheduled = data || [];

  const handleStart = async (streamId) => {
    setStarting(streamId);
    try {
      const r = await api.post(`/live/scheduled/${streamId}/start`);
      toast.success('🎙️ انطلق البث!', { style: { fontFamily: 'inherit', direction: 'rtl' } });
      onStarted(r.data.stream);
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في بدء البث');
      setStarting(null);
    }
  };

  const handleCancel = async (streamId) => {
    if (!window.confirm('إلغاء هذا البث المجدول؟')) return;
    try {
      await api.delete(`/live/scheduled/${streamId}`);
      toast.success('تم إلغاء البث', { style: { fontFamily: 'inherit', direction: 'rtl' } });
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في الإلغاء');
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-10">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
             style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.25)' }}>
          <Radio className="w-9 h-9 text-red-500" />
        </div>
        <h2 className={`text-2xl font-black mb-2 ${dark ? 'text-white' : 'text-slate-800'}`}>البث المباشر</h2>
        <p className={`text-sm mb-6 max-w-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          تواصل مع طلابك مباشرةً أو جدول موعداً مسبقاً فيظهر للطلاب مع عدّاد تنازلي.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <button onClick={onGoToForm}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-white text-sm bg-red-600 hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/25 active:scale-95">
            <Radio className="w-4 h-4" /> ابدأ بثاً الآن
          </button>
          <button onClick={onSchedule}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm border-2 transition-all active:scale-95 ${dark ? 'border-purple-500 text-purple-400 hover:bg-purple-600 hover:text-white' : 'border-purple-500 text-purple-600 hover:bg-purple-600 hover:text-white'}`}>
            <Calendar className="w-4 h-4" /> جدول موعداً
          </button>
        </div>
      </div>

      {/* Scheduled streams list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-base font-black ${dark ? 'text-white' : 'text-slate-700'}`}>
            البثوث المجدولة
            {scheduled.length > 0 && <span className="mr-2 text-sm font-bold text-purple-500">({scheduled.length})</span>}
          </h3>
          <button onClick={() => refetch()} disabled={isLoading}
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-purple-500 animate-spin" /></div>
        ) : scheduled.length === 0 ? (
          <div className={`text-center py-10 rounded-2xl border border-dashed ${dark ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-400'}`}>
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد بثوث مجدولة</p>
            <p className="text-xs mt-1 opacity-70">اضغط "جدول موعداً" لإضافة بث مستقبلي</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduled.map(s => (
              <ScheduledStreamCard
                key={s.id} stream={s} dark={dark}
                starting={starting === s.id}
                onStart={() => handleStart(s.id)}
                onCancel={() => handleCancel(s.id)}
              />
            ))}
          </div>
        )}
      </div>
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
      <div className="overflow-hidden" style={{ height: 'calc(100dvh - 56px)' }}>
        <LiveView stream={stream} user={user} dark={dark} onEnd={handleEnded} />
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {view === 'form'
        ? <StreamForm dark={dark} onBack={() => setView('idle')} onStarted={handleStarted} />
        : view === 'schedule'
        ? <ScheduleForm dark={dark} onBack={() => setView('idle')} onScheduled={() => setView('idle')} />
        : <IdleView dark={dark} onGoToForm={() => setView('form')} onSchedule={() => setView('schedule')} onStarted={handleStarted} />
      }
    </div>
  );
}
