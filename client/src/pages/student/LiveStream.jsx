import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStream } from '../../context/LiveStreamContext';
import JitsiMeet from '../../components/JitsiMeet';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Radio, MessageSquare, Send, Hand, LogOut,
  MessageCircleOff, Loader2, Users, RefreshCw,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';

/* ── Chat Panel (student) ──────────────────────────────────── */
function ChatPanel({ stream, studentName, dark, onClose }) {
  const [messages, setMessages]       = useState([]);
  const [text, setText]               = useState('');
  const [chatEnabled, setChatEnabled] = useState(stream.chat_enabled !== false);
  const [sending, setSending]         = useState(false);
  const bottomRef = useRef(null);

  useQuery({
    queryKey: ['live-chat-student', stream.id],
    queryFn:  async () => {
      const r = await api.get(`/live/${stream.id}/chat`);
      setMessages(r.data.messages || []);
      return r.data.messages;
    },
    refetchInterval: 3500,
    enabled: !!stream.id,
  });

  useEffect(() => {
    const onMsg = (e) => {
      const msg = e.detail;
      if (String(msg.stream_id) === String(stream.id))
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    };
    const onToggle = (e) => {
      if (String(e.detail.streamId) === String(stream.id))
        setChatEnabled(e.detail.enabled);
    };
    window.addEventListener('wathba_live_chat',        onMsg);
    window.addEventListener('wathba_live_chat_toggle', onToggle);
    return () => {
      window.removeEventListener('wathba_live_chat',        onMsg);
      window.removeEventListener('wathba_live_chat_toggle', onToggle);
    };
  }, [stream.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMsg = async () => {
    if (!text.trim() || sending || !chatEnabled) return;
    setSending(true);
    try {
      await api.post(`/live/${stream.id}/chat`, { message: text.trim() });
      setText('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل الإرسال');
    } finally { setSending(false); }
  };

  return (
    <div className={`flex flex-col h-full ${dark ? 'bg-slate-900' : 'bg-white'}`}>
      <div className={`px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-500" />
          <span className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>الدردشة</span>
          {!chatEnabled && (
            <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
              <MessageCircleOff className="w-3 h-3" /> معطلة
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد رسائل بعد</p>
          </div>
        ) : messages.map(msg => (
          <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.sender_type === 'student' && msg.sender_name === studentName ? 'items-end' : 'items-start'}`}>
            <span className={`text-[10px] px-1 ${msg.sender_type === 'teacher' ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>
              {msg.sender_type === 'teacher' ? `👨‍🏫 ${msg.sender_name}` : msg.sender_name}
            </span>
            <div className={`text-sm px-3 py-2 rounded-2xl max-w-[90%] leading-relaxed ${
              msg.sender_type === 'teacher'
                ? 'bg-navy-600 text-white rounded-bl-sm'
                : msg.sender_name === studentName
                  ? 'bg-orange-500 text-white rounded-br-sm'
                  : dark ? 'bg-slate-700 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-br-sm'
            }`}>
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={`p-3 border-t flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        {!chatEnabled ? (
          <div className={`text-center text-xs py-2 rounded-xl ${dark ? 'text-slate-500 bg-slate-800' : 'text-slate-400 bg-slate-50'}`}>
            <MessageCircleOff className="w-4 h-4 mx-auto mb-1" />
            الدردشة معطلة من قِبَل المعلم
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder="اكتب رسالة..."
              className={`flex-1 text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800'}`}
            />
            <button onClick={sendMsg} disabled={!text.trim() || sending}
              className="p-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl disabled:opacity-50 transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Live view (student) ───────────────────────────────────── */
function LiveView({ stream, user, dark, onLeave }) {
  const [chatOpen, setChatOpen]   = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [raisingHand, setRaisingHand] = useState(false);
  const [leaving, setLeaving]     = useState(false);

  // Handle live_ended from teacher
  useEffect(() => {
    const h = (e) => {
      if (String(e.detail?.streamId) === String(stream.id)) {
        toast('📴 انتهى البث المباشر', { duration: 5000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        onLeave();
      }
    };
    window.addEventListener('wathba_live_ended', h);
    return () => window.removeEventListener('wathba_live_ended', h);
  }, [stream.id, onLeave]);

  const toggleHand = async () => {
    setRaisingHand(true);
    const next = !handRaised;
    try {
      await api.post(`/live/${stream.id}/hand-raise`, { raised: next });
      setHandRaised(next);
      toast(next ? '✋ رفعت يدك' : '✅ أخفضت يدك', { duration: 2500, style: { fontFamily: 'inherit', direction: 'rtl' } });
    } catch (_) {} finally { setRaisingHand(false); }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await api.post(`/live/${stream.id}/leave`);
      if (handRaised) {
        try { await api.post(`/live/${stream.id}/hand-raise`, { raised: false }); } catch (_) {}
      }
    } catch (_) {}
    onLeave();
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
          {stream.teacher_name && (
            <span className="text-red-300 text-xs hidden sm:block flex-shrink-0">👨‍🏫 {stream.teacher_name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {stream.hand_raise_enabled !== false && (
            <button
              onClick={toggleHand}
              disabled={raisingHand}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                handRaised
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white animate-pulse'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {raisingHand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '✋'}
              {handRaised ? 'يدك مرفوعة' : 'ارفع يدك'}
            </button>
          )}
          <button
            onClick={() => setChatOpen(p => !p)}
            className={`p-1.5 rounded-lg transition-colors ${chatOpen ? 'bg-green-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            title="الدردشة"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white transition-colors disabled:opacity-60"
          >
            {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            مغادرة
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-black overflow-hidden">
          <JitsiMeet
            roomName={stream.room_id}
            displayName={user?.name || 'طالب'}
            onLeft={handleLeave}
            style={{ height: '100%', width: '100%' }}
          />
        </div>
        {chatOpen && (
          <div className={`w-64 sm:w-72 flex flex-col flex-shrink-0 ${dark ? 'border-r border-slate-700' : 'border-r border-slate-200'}`}>
            <ChatPanel stream={stream} studentName={user?.name} dark={dark} onClose={() => setChatOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stream card (lobby) ───────────────────────────────────── */
function StreamCard({ stream, onJoin, dark }) {
  const [joining, setJoining] = useState(false);

  const elapsed = (() => {
    const secs = Math.floor((Date.now() - new Date(stream.started_at).getTime()) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}س ${m}د` : `${m} دقيقة`;
  })();

  const handleJoin = async () => {
    setJoining(true);
    try {
      await api.post(`/live/${stream.id}/join`);
      onJoin(stream);
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل في الانضمام');
      setJoining(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-5 transition-all hover:shadow-lg ${dark ? 'bg-slate-800 border-slate-700 hover:border-red-500/50' : 'bg-white border-slate-200 hover:border-red-300'}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.25)' }}>
          <Radio className="w-6 h-6 text-red-500 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-red-600 text-white font-black px-2 py-0.5 rounded-full">مباشر الآن</span>
            {stream.teacher_name && (
              <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>👨‍🏫 {stream.teacher_name}</span>
            )}
          </div>
          <h3 className={`font-black text-base mb-1 truncate ${dark ? 'text-white' : 'text-slate-800'}`}>{stream.title}</h3>
          {stream.description && (
            <p className={`text-sm leading-relaxed mb-3 line-clamp-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{stream.description}</p>
          )}
          <div className={`flex items-center gap-3 text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{stream.viewer_count || 0} مشاهد</span>
            <span>⏱ منذ {elapsed}</span>
            {!stream.chat_enabled && <span className="flex items-center gap-1"><MessageCircleOff className="w-3.5 h-3.5" /> دردشة معطلة</span>}
          </div>
          <button onClick={handleJoin} disabled={joining}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-all active:scale-[0.98]">
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            {joining ? 'جارٍ الانضمام...' : 'انضم للبث الآن'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Lobby ─────────────────────────────────────────────────── */
function LobbyView({ dark, onJoin }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['live-available'],
    queryFn: () => api.get('/live/available').then(r => r.data.streams),
    refetchInterval: 15000,
  });
  const streams = data || [];

  // Listen for live_started / live_ended to refresh lobby
  useEffect(() => {
    const h = () => refetch();
    window.addEventListener('wathba_live_started', h);
    window.addEventListener('wathba_live_ended',   h);
    return () => {
      window.removeEventListener('wathba_live_started', h);
      window.removeEventListener('wathba_live_ended',   h);
    };
  }, [refetch]);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className={`text-xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>البث المباشر</h2>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            {streams.length > 0 ? `${streams.length} بث${streams.length > 1 ? 'وث' : ''} متاح` : 'لا يوجد بث حالياً'}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isLoading}
          className={`p-2 rounded-xl transition-colors ${dark ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          title="تحديث">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-4" />
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>جارٍ التحقق من البثوث المتاحة...</p>
        </div>
      ) : streams.length === 0 ? (
        <div className={`text-center py-20 rounded-2xl border ${dark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
               style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.2)' }}>
            <Radio className="w-9 h-9 text-red-400" />
          </div>
          <h3 className={`font-black text-lg mb-2 ${dark ? 'text-white' : 'text-slate-700'}`}>لا يوجد بث مباشر الآن</h3>
          <p className={`text-sm max-w-xs mx-auto leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            ستظهر هنا أي جلسة بث مباشر يفتحها معلمك. ستصلك إشعاراً فور بدء البث.
          </p>
          <button onClick={() => refetch()}
            className={`mt-5 flex items-center gap-1.5 mx-auto text-sm font-bold px-4 py-2 rounded-xl transition-colors ${dark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'}`}>
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {streams.map(s => <StreamCard key={s.id} stream={s} dark={dark} onJoin={onJoin} />)}
        </div>
      )}
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────── */
export default function StudentLiveStream() {
  const { dark }  = useTheme();
  const { user }  = useAuth();
  const { joinStudentStream, leaveStudentStream } = useLiveStream();
  const [stream, setStream] = useState(null);

  const handleJoin = (s) => {
    setStream(s);
    joinStudentStream(s);
  };

  const handleLeave = () => {
    if (stream) leaveStudentStream(stream.id);
    setStream(null);
  };

  if (stream) {
    return (
      <div className="overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        <LiveView stream={stream} user={user} dark={dark} onLeave={handleLeave} />
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <LobbyView dark={dark} onJoin={handleJoin} />
    </div>
  );
}
