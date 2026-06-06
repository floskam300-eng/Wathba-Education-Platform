import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStream } from '../../context/LiveStreamContext';
import LiveKitRoom from '../../components/LiveKitRoom';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Radio, MessageSquare, Send, Hand, LogOut,
  MessageCircleOff, Loader2, Users, RefreshCw,
  ChevronLeft, ChevronRight, X, Maximize, Minimize,
  Calendar, Clock,
} from 'lucide-react';

/* ── Chat Panel (student) ──────────────────────────────────── */
function ChatPanel({ stream, myId, studentName, dark, onClose }) {
  const [messages, setMessages]       = useState([]);
  const [text, setText]               = useState('');
  const [chatEnabled, setChatEnabled] = useState(stream.chat_enabled !== false);
  const [sending, setSending]         = useState(false);
  // FIX: track timestamp of last received message for incremental polling
  const lastMsgTimeRef = useRef(null);
  const bottomRef = useRef(null);

  // Initial fetch
  useEffect(() => {
    api.get(`/live/${stream.id}/chat`).then(r => {
      const msgs = r.data.messages || [];
      setMessages(msgs);
      if (msgs.length) {
        lastMsgTimeRef.current = new Date(msgs[msgs.length - 1].sent_at).getTime();
      }
    }).catch(() => {});
  }, [stream.id]);

  // SSE delivers chat messages instantly — this poll is a safety net only
  // (catches any messages missed during SSE reconnection)
  useEffect(() => {
    const fetchNew = async () => {
      try {
        const since = lastMsgTimeRef.current;
        const url   = since ? `/live/${stream.id}/chat?since=${since}` : `/live/${stream.id}/chat`;
        const r     = await api.get(url);
        const newMsgs = r.data.messages || [];
        if (newMsgs.length) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const toAdd = newMsgs.filter(m => !existingIds.has(m.id));
            if (!toAdd.length) return prev;
            lastMsgTimeRef.current = new Date(newMsgs[newMsgs.length - 1].sent_at).getTime();
            return [...prev, ...toAdd];
          });
        }
      } catch (_) {}
    };
    const iv = setInterval(fetchNew, 60000);
    return () => clearInterval(iv);
  }, [stream.id]);

  // SSE: instant new messages
  useEffect(() => {
    const onMsg = (e) => {
      const msg = e.detail;
      if (String(msg.stream_id) === String(stream.id)) {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          lastMsgTimeRef.current = new Date(msg.sent_at).getTime();
          return [...prev, msg];
        });
      }
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
    <div className={`flex flex-col h-full ${dark ? 'bg-[#0F0E15]' : 'bg-white'}`}>
      <div className={`px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0 ${dark ? 'border-[rgba(230,175,80,0.12)]' : 'border-slate-200'}`}>
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
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-[#C4B8AC] hover:bg-[#1F1C2C]' : 'text-[#C4B8AC] hover:bg-slate-100'}`}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[#F2EDE5]" />
            <p className={`text-xs ${dark ? 'text-[#8A7E72]' : 'text-[#C4B8AC]'}`}>لا توجد رسائل بعد</p>
          </div>
        ) : messages.map(msg => {
          // FIX: use sender_id for identity — not sender_name (avoids same-name collision)
          const isMe = msg.sender_type !== 'teacher' && String(msg.sender_id) === String(myId);
          return (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${isMe || msg.sender_type === 'teacher' ? 'items-end' : 'items-start'}`}>
              <span className={`text-[10px] px-1 ${msg.sender_type === 'teacher' ? 'text-orange-400 font-bold' : 'text-[#C4B8AC]'}`}>
                {msg.sender_type === 'teacher' ? `👨‍🏫 ${msg.sender_name}` : msg.sender_name}
              </span>
              <div className={`text-sm px-3 py-2 rounded-2xl max-w-[90%] leading-relaxed ${
                msg.sender_type === 'teacher'
                  ? 'bg-purple-700 text-white rounded-bl-sm'
                  : isMe
                    ? 'bg-orange-500 text-white rounded-br-sm'
                    : dark ? 'bg-[#1F1C2C] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-br-sm'
              }`}>
                {msg.message}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className={`p-3 border-t flex-shrink-0 ${dark ? 'border-[rgba(230,175,80,0.12)]' : 'border-slate-200'}`}>
        {!chatEnabled ? (
          <div className={`text-center text-xs py-2 rounded-xl ${dark ? 'text-[#8A7E72] bg-[#17151F]' : 'text-[#C4B8AC] bg-slate-50'}`}>
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
              className={`flex-1 text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? 'bg-[#1F1C2C] border-[rgba(230,175,80,0.18)] text-white placeholder-[#8A7E72]' : 'bg-white border-slate-300 text-slate-800'}`}
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
  const [chatOpen, setChatOpen]           = useState(true);
  const [handRaised, setHandRaised]       = useState(false);
  const [raisingHand, setRaisingHand]     = useState(false);
  const [leaving, setLeaving]             = useState(false);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [uiVisible, setUiVisible]         = useState(true);
  const [myPermissions, setMyPermissions] = useState({ can_speak: false, can_share_screen: false });
  const [livekitKey, setLivekitKey]       = useState(0);
  const videoWrapRef = useRef(null);
  const uiHideTimer  = useRef(null);

  const showUiTemporarily = useCallback(() => {
    setUiVisible(true);
    clearTimeout(uiHideTimer.current);
    uiHideTimer.current = setTimeout(() => setUiVisible(false), 4000);
  }, []);

  const handleVideoTap = useCallback(() => {
    setUiVisible(v => {
      if (v) {
        clearTimeout(uiHideTimer.current);
        return false;
      }
      uiHideTimer.current = setTimeout(() => setUiVisible(false), 4000);
      return true;
    });
  }, []);

  useEffect(() => () => clearTimeout(uiHideTimer.current), []);

  // Load initial permissions
  useEffect(() => {
    api.get(`/live/${stream.id}/my-permissions`).then(r => {
      setMyPermissions({ can_speak: !!r.data.can_speak, can_share_screen: !!r.data.can_share_screen });
    }).catch(() => {});
  }, [stream.id]);

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

  // Handle live_kicked
  useEffect(() => {
    const h = (e) => {
      if (String(e.detail?.streamId) === String(stream.id)) {
        toast.error('🚫 ' + (e.detail?.message || 'تم إخراجك من البث'), {
          duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' },
        });
        onLeave();
      }
    };
    window.addEventListener('wathba_live_kicked', h);
    return () => window.removeEventListener('wathba_live_kicked', h);
  }, [stream.id, onLeave]);

  // Handle live_permission_update
  useEffect(() => {
    const h = (e) => {
      if (String(e.detail?.streamId) === String(stream.id)) {
        const { can_speak, can_share_screen } = e.detail;
        const newPerms = { can_speak: !!can_speak, can_share_screen: !!can_share_screen };

        // BUG-FIX: only remount LiveKitRoom when a permission is newly GRANTED —
        // that requires a new token with canPublish=true.
        // When only revoking, LiveKitRoom's auto-mute effects handle it locally
        // without a disruptive full reconnect (saves token rate-limiter quota too).
        const wasGranted =
          (newPerms.can_speak        && !myPermissions.can_speak) ||
          (newPerms.can_share_screen && !myPermissions.can_share_screen);

        setMyPermissions(newPerms);
        if (wasGranted) setLivekitKey(k => k + 1);
      }
    };
    window.addEventListener('wathba_live_permission_update', h);
    return () => window.removeEventListener('wathba_live_permission_update', h);
  // myPermissions intentionally in deps so handler sees current permissions
  }, [stream.id, myPermissions]);

  const toggleHand = async () => {
    setRaisingHand(true);
    const next = !handRaised;
    try {
      await api.post(`/live/${stream.id}/hand-raise`, { raised: next });
      setHandRaised(next);
      toast(next ? '✋ رفعت يدك' : '✅ أخفضت يدك', { duration: 2500, style: { fontFamily: 'inherit', direction: 'rtl' } });
    } catch (err) {
      toast.error(err.response?.data?.error || 'تعذّر رفع اليد');
    } finally { setRaisingHand(false); }
  };

  // FIX: leave API call is here only (not duplicated in context)
  const handleLeave = async () => {
    setLeaving(true);
    try {
      await api.post(`/live/${stream.id}/leave`);
    } catch (_) {}
    onLeave();
  };

  // Fullscreen + orientation lock
  const toggleFullscreen = useCallback(async () => {
    const el = videoWrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
        if (screen?.orientation?.lock) {
          try { await screen.orientation.lock('landscape'); } catch (_) {}
        }
      } catch (_) {}
    } else {
      try {
        await document.exitFullscreen();
        if (screen?.orientation?.unlock) {
          try { screen.orientation.unlock(); } catch (_) {}
        }
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  return (
    <div className="flex flex-col">
      {/* Top bar — fades out in focus mode */}
      <div
        className={`flex items-center justify-between px-3 py-2 flex-shrink-0 sticky top-0 z-30 transition-all duration-300 ${uiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ backgroundColor: '#1a0000', borderBottom: '1px solid rgba(239,68,68,0.3)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 bg-red-600 text-white text-[11px] font-black px-2 py-1 rounded-full flex-shrink-0 animate-pulse">
            <Radio className="w-2.5 h-2.5" /> مباشر
          </span>
          <span className="text-white font-bold text-xs sm:text-sm truncate">{stream.title}</span>
          {stream.teacher_name && (
            <span className="text-red-300 text-xs hidden sm:block flex-shrink-0">👨‍🏫 {stream.teacher_name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {stream.hand_raise_enabled !== false && (
            <button
              onClick={toggleHand}
              disabled={raisingHand}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors ${
                handRaised
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white animate-pulse'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {raisingHand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>✋</span>}
              <span className="hidden sm:inline text-xs">{handRaised ? 'يدك مرفوعة' : 'ارفع يدك'}</span>
            </button>
          )}
          <button
            onClick={() => setChatOpen(p => !p)}
            className={`p-1.5 rounded-lg transition-colors ${chatOpen ? 'bg-green-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="flex items-center gap-1 text-xs font-black px-2 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white transition-colors disabled:opacity-60"
          >
            {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">مغادرة</span>
          </button>
        </div>
      </div>

      {/* Body — stacks on mobile, side-by-side on desktop */}
      <div className="flex flex-col md:flex-row md:items-start">
        {/* Video */}
        <div
          ref={videoWrapRef}
          className="relative bg-black w-full md:flex-1 cursor-pointer"
          style={{ aspectRatio: '16/9' }}
          onClick={handleVideoTap}
        >
          <LiveKitRoom
            key={livekitKey}
            streamId={stream.id}
            displayName={user?.name || 'طالب'}
            isTeacher={false}
            canSpeak={myPermissions.can_speak}
            canShareScreen={myPermissions.can_share_screen}
            style={{ height: '100%', width: '100%' }}
          />

          {!uiVisible && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
              <div className="bg-black/40 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm opacity-70 animate-pulse">
                اضغط لإظهار الأدوات
              </div>
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            title={isFullscreen ? 'تصغير' : 'تكبير الشاشة كاملة'}
            className={`absolute bottom-3 left-3 z-10 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white transition-all shadow-lg backdrop-blur-sm duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div
            className={`w-full md:w-72 md:flex-none border-t md:border-t-0 md:border-r flex flex-col
              ${dark ? 'bg-[#0F0E15] border-[rgba(230,175,80,0.12)]' : 'bg-white border-slate-200'}`}
            style={{ minHeight: '360px', maxHeight: '520px', height: '420px' }}
          >
            <ChatPanel
              stream={stream}
              myId={user?.id}
              studentName={user?.name}
              dark={dark}
              onClose={() => setChatOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Countdown display ─────────────────────────────────────── */
function Countdown({ target }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setLabel('ابدأ البث الآن!'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0
        ? `${h}س ${String(m).padStart(2,'0')}د`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [target]);
  return <span className="font-mono">{label}</span>;
}

/* ── FIX: reactive elapsed timer hook ─────────────────────── */
function useReactiveElapsed(startedAt) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      setElapsed(h > 0 ? `${h}س ${m}د` : `${m} دقيقة`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return elapsed;
}

/* ── Upcoming scheduled stream card ───────────────────────── */
function ScheduledCard({ stream, dark }) {
  const dateStr = new Date(stream.scheduled_at).toLocaleString('ar-EG', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const isPast = new Date(stream.scheduled_at).getTime() <= Date.now();

  return (
    <div className={`rounded-2xl border p-5 ${dark ? 'bg-[#17151F]/90 border-[rgba(230,175,80,0.12)]' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(139,92,246,0.12)', border: '2px solid rgba(139,92,246,0.25)' }}>
          <Calendar className="w-6 h-6 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-purple-600 text-white font-black px-2 py-0.5 rounded-full">قادم قريباً</span>
            {stream.teacher_name && (
              <span className={`text-xs ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>👨‍🏫 {stream.teacher_name}</span>
            )}
          </div>
          <h3 className={`font-black text-base mb-1 truncate ${dark ? 'text-white' : 'text-slate-800'}`}>{stream.title}</h3>
          {stream.description && (
            <p className={`text-sm leading-relaxed mb-2 line-clamp-2 ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>{stream.description}</p>
          )}
          <div className={`flex items-center gap-3 text-xs ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {dateStr}
            </span>
          </div>
          <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${dark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-bold">
              {isPast ? 'جارٍ البدء قريباً...' : <>بعد <Countdown target={stream.scheduled_at} /></>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stream card (lobby) — FIX: reactive elapsed timer ────── */
function StreamCard({ stream, onJoin, dark }) {
  const [joining, setJoining] = useState(false);
  // FIX: use reactive timer instead of static computation at render time
  const elapsed = useReactiveElapsed(stream.started_at);

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
    <div className={`rounded-2xl border p-5 transition-all hover:shadow-lg ${dark ? 'bg-[#17151F] border-[rgba(230,175,80,0.12)] hover:border-red-500/50' : 'bg-white border-slate-200 hover:border-red-300'}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.25)' }}>
          <Radio className="w-6 h-6 text-red-500 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-red-600 text-white font-black px-2 py-0.5 rounded-full">مباشر الآن</span>
            {stream.teacher_name && (
              <span className={`text-xs ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>👨‍🏫 {stream.teacher_name}</span>
            )}
          </div>
          <h3 className={`font-black text-base mb-1 truncate ${dark ? 'text-white' : 'text-slate-800'}`}>{stream.title}</h3>
          {stream.description && (
            <p className={`text-sm leading-relaxed mb-3 line-clamp-2 ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>{stream.description}</p>
          )}
          <div className={`flex items-center gap-3 text-xs mb-4 ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{stream.viewer_count || 0} مشاهد</span>
            {elapsed && <span>⏱ منذ {elapsed}</span>}
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
  const allStreams = data || [];
  const active    = allStreams.filter(s => s.status === 'active');
  const upcoming  = allStreams.filter(s => s.status === 'scheduled');

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
          <p className={`text-sm ${dark ? 'text-[#C4B8AC]' : 'text-[#8A7E72]'}`}>
            {active.length > 0
              ? `${active.length} بث مباشر الآن`
              : upcoming.length > 0
                ? `${upcoming.length} بث قادم`
                : 'لا يوجد بث حالياً'}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isLoading}
          className={`p-2 rounded-xl transition-colors ${dark ? 'text-[#C4B8AC] hover:bg-[#1F1C2C]' : 'text-[#C4B8AC] hover:bg-slate-100'}`}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>
      ) : active.length === 0 && upcoming.length === 0 ? (
        <div className={`text-center py-16 rounded-2xl border border-dashed ${dark ? 'border-[rgba(230,175,80,0.12)] text-[#8A7E72]' : 'border-slate-200 text-[#C4B8AC]'}`}>
          <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className={`text-base font-bold mb-1 ${dark ? 'text-[#C4B8AC]' : 'text-slate-500'}`}>لا يوجد بث حالياً</p>
          <p className="text-sm">سيظهر هنا عند بدء المعلم للبث</p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <>
              <h3 className={`text-sm font-black uppercase tracking-wide ${dark ? 'text-red-400' : 'text-red-600'}`}>🔴 يبث الآن</h3>
              {active.map(s => <StreamCard key={s.id} stream={s} onJoin={onJoin} dark={dark} />)}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <h3 className={`text-sm font-black uppercase tracking-wide mt-6 ${dark ? 'text-purple-400' : 'text-purple-600'}`}>📅 بثوث قادمة</h3>
              {upcoming.map(s => <ScheduledCard key={s.id} stream={s} dark={dark} />)}
            </>
          )}
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
  const [activeStream, setActiveStream] = useState(null);

  const handleJoin = useCallback((stream) => {
    setActiveStream(stream);
    joinStudentStream(stream);
  }, [joinStudentStream]);

  const handleLeave = useCallback(() => {
    setActiveStream(null);
    // FIX: context only clears local state — API was already called in LiveView
    leaveStudentStream();
  }, [leaveStudentStream]);

  if (activeStream) {
    return (
      <div className={`h-full overflow-y-auto ${dark ? 'bg-[#0A0910]' : 'bg-slate-50'}`}>
        <LiveView stream={activeStream} user={user} dark={dark} onLeave={handleLeave} />
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${dark ? 'bg-[#0F0E15]' : 'bg-gray-50'}`}>
      <LobbyView dark={dark} onJoin={handleJoin} />
    </div>
  );
}
