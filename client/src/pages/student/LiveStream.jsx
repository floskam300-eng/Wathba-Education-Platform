import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  Video, VideoOff, Mic, MicOff, Hand, MessageCircle,
  Users, Send, Radio, Clock, LogIn, LogOut,
  Volume2, VolumeX, Settings, ChevronRight,
  AlertTriangle, Loader2, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK_STREAMS = [
  {
    id: 1, roomId: 'wathba-demo-live',
    teacherName: 'الأستاذ / أحمد محمد',
    title: 'مراجعة الجبر — الوحدة الثالثة',
    subject: 'رياضيات', stage: 'الصف الثاني الثانوي',
    startedAt: new Date(Date.now() - 18 * 60 * 1000),
    viewersCount: 27, live: true,
  },
];

const MOCK_CHAT = [
  { id: 1, sender: 'محمد علي', msg: 'أستاذ مش فاهم الجزء الأخير ممكن تعيده؟', ts: Date.now() - 300000, type: 'student' },
  { id: 2, sender: 'الأستاذ', msg: 'حبوب، هرجعه دلوقتي 👍', ts: Date.now() - 240000, type: 'teacher' },
  { id: 3, sender: 'ياسمين سمير', msg: 'شكراً أستاذ الشرح واضح جداً', ts: Date.now() - 180000, type: 'student' },
  { id: 4, sender: 'عمر فاروق', msg: 'ممكن تحل مثال تاني؟', ts: Date.now() - 60000, type: 'student' },
];
const EMOJIS = ['👍', '❤️', '😮', '🎉', '🤔', '👏'];

const fmtTime = (d) => new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
const fmtElapsed = (s) => { const d = Math.floor((Date.now() - new Date(s).getTime()) / 60000); return d < 60 ? `${d} دقيقة` : `${Math.floor(d / 60)}س ${d % 60}د`; };

function MicMeter({ stream }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf;
      const tick = () => { analyser.getByteFrequencyData(data); setLevel(Math.min(100, (data.reduce((a, b) => a + b, 0) / data.length / 128) * 200)); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      return () => { cancelAnimationFrame(raf); ctx.close(); };
    } catch { }
  }, [stream]);
  const bars = 16;
  return (
    <div className="flex items-center gap-0.5 h-4">
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className={`w-1.5 rounded-full transition-all duration-75 ${i < (level / 100) * bars ? 'bg-green-500' : 'bg-gray-300'}`}
          style={{ height: `${30 + (i / bars) * 70}%` }} />
      ))}
    </div>
  );
}

function DeviceCheckScreen({ stream: targetStream, onJoin, onBack, dark }) {
  const videoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selCam, setSelCam] = useState('');
  const [selMic, setSelMic] = useState('');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const startPreview = useCallback(async (camId, micId, cOn, mOn) => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: cOn ? (camId ? { deviceId: { exact: camId } } : true) : false,
        audio: mOn ? (micId ? { deviceId: { exact: micId } } : true) : false,
      });
      setLocalStream(s);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.muted = true; }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter(d => d.kind === 'videoinput'));
      setMics(devices.filter(d => d.kind === 'audioinput'));
      setError('');
    } catch {
      setError('لم يتم منح إذن الكاميرا أو الميك — يمكنك الانضمام بدونهم.');
      setLocalStream(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    startPreview('', '', true, true);
    return () => { if (localStream) localStream.getTracks().forEach(t => t.stop()); };
  }, []);

  const handleJoin = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    onJoin(targetStream, { camOn, micOn, selCam, selMic });
  };

  const el = dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-200';
  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100 shadow-sm';

  return (
    <div className={`rounded-2xl border ${card} overflow-hidden`} dir="rtl">
      <div className="bg-gradient-to-r from-navy-700 to-indigo-800 px-6 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white/70 hover:text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-white font-black">فحص أجهزتك قبل الانضمام</h2>
          <p className="text-navy-200 text-xs mt-0.5">{targetStream.title} — {targetStream.teacherName}</p>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-950 flex items-center justify-center">
            {loading && <div className="text-gray-400 text-sm animate-pulse">جاري الوصول للكاميرا...</div>}
            {!camOn && !loading && (
              <div className="text-center">
                <VideoOff className="w-10 h-10 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">الكاميرا مغلقة</p>
              </div>
            )}
            {error && !loading && camOn && (
              <div className="text-center px-4">
                <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-yellow-300 text-xs font-bold">{error}</p>
              </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted
              className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${(!camOn || error) ? 'hidden' : ''}`} />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button onClick={() => { const n = !camOn; setCamOn(n); startPreview(selCam, selMic, n, micOn); }}
                className={`p-1.5 rounded-lg transition-all ${camOn ? 'bg-orange-500 text-white' : 'bg-black/60 text-white'}`}>
                {camOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { const n = !micOn; setMicOn(n); startPreview(selCam, selMic, camOn, n); }}
                className={`p-1.5 rounded-lg transition-all ${micOn ? 'bg-orange-500 text-white' : 'bg-black/60 text-white'}`}>
                {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {micOn && localStream && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${el}`}>
              <Mic className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1"><MicMeter stream={localStream} /></div>
              <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>مستوى الصوت</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-black mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الكاميرا</label>
            <select value={selCam} onChange={e => { setSelCam(e.target.value); startPreview(e.target.value, selMic, camOn, micOn); }} className="input-field w-full" disabled={!camOn || !!error}>
              <option value="">الكاميرا الافتراضية</option>
              {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || `كاميرا ${c.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-black mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الميكروفون</label>
            <select value={selMic} onChange={e => { setSelMic(e.target.value); startPreview(selCam, e.target.value, camOn, micOn); }} className="input-field w-full" disabled={!micOn || !!error}>
              <option value="">الميكروفون الافتراضي</option>
              {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `ميكروفون ${m.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </div>

          <div className={`rounded-xl p-4 border space-y-2 ${el}`}>
            {[
              { label: 'الكاميرا', ok: camOn && !error, off: !camOn },
              { label: 'الميكروفون', ok: micOn && !error, off: !micOn },
            ].map(({ label, ok, off }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : off ? 'bg-gray-400' : 'bg-yellow-500'}`} />
                <span className={`text-sm font-bold flex-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{label}</span>
                <span className={`text-xs font-bold ${ok ? 'text-green-600' : off ? 'text-gray-400' : 'text-yellow-600'}`}>
                  {ok ? 'جاهز ✓' : off ? 'مغلق' : 'لا يوجد إذن'}
                </span>
              </div>
            ))}
          </div>

          <button onClick={handleJoin} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <LogIn className="w-5 h-5" /> انضم للبث الآن
          </button>
          <button onClick={onBack} className="btn-secondary w-full">رجوع</button>
        </div>
      </div>
    </div>
  );
}

function LiveView({ stream, devConf, onLeave, dark }) {
  const selfVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(devConf?.micOn ?? false);
  const [camOn, setCamOn] = useState(devConf?.camOn ?? false);
  const [handRaised, setHandRaised] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [chatMsg, setChatMsg] = useState('');
  const [msgs, setMsgs] = useState(MOCK_CHAT);
  const [activeEmoji, setActiveEmoji] = useState(null);
  const [emojiAnim, setEmojiAnim] = useState([]);
  const [viewers, setViewers] = useState(stream.viewersCount + 1);
  const [elapsed, setElapsed] = useState(fmtElapsed(stream.startedAt));
  const chatEndRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(fmtElapsed(stream.startedAt)), 30000);
    const v = setInterval(() => setViewers(c => Math.max(1, c + (Math.random() > 0.6 ? (Math.random() > 0.5 ? 1 : -1) : 0))), 12000);
    return () => { clearInterval(t); clearInterval(v); };
  }, [stream.startedAt]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  useEffect(() => {
    if (!devConf?.camOn && !devConf?.micOn) return;
    navigator.mediaDevices.getUserMedia({ video: devConf.camOn, audio: devConf.micOn })
      .then(s => {
        setLocalStream(s);
        if (selfVideoRef.current) { selfVideoRef.current.srcObject = s; selfVideoRef.current.muted = true; }
      }).catch(() => {});
    return () => { if (localStream) localStream.getTracks().forEach(t => t.stop()); };
  }, []);

  const toggleMic = () => {
    if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(v => !v);
  };
  const toggleCam = () => {
    if (localStream) localStream.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(v => !v);
  };

  const sendEmoji = (emoji) => {
    const id = Date.now();
    setEmojiAnim(prev => [...prev, { id, emoji, x: Math.random() * 60 + 20 }]);
    setTimeout(() => setEmojiAnim(prev => prev.filter(e => e.id !== id)), 3000);
  };

  const sendMsg = () => {
    if (!chatMsg.trim()) return;
    setMsgs(prev => [...prev, { id: Date.now(), sender: 'أنا', msg: chatMsg.trim(), ts: Date.now(), type: 'me' }]);
    setChatMsg('');
  };

  const handleRaiseHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    toast(next ? '✋ طلبت الكلام — انتظر إذن الأستاذ' : 'نزّلت يدك 👇', { duration: 2500 });
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 57px)' }} dir="rtl">
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
        style={dark ? { backgroundColor: 'var(--dk-surface)', borderColor: 'var(--dk-border)' } : { backgroundColor: '#fff', borderColor: '#e5e7eb' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse flex-shrink-0">
            <Radio className="w-3 h-3" /> مباشر
          </span>
          <span className={`text-sm font-black truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>{stream.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-bold hidden sm:flex items-center gap-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
            <Users className="w-3.5 h-3.5" /> {viewers}
          </span>
          <button onClick={() => setShowChat(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-500 hover:bg-gray-100'}`}>
            <MessageCircle className="w-4 h-4" />
          </button>
          <button onClick={onLeave}
            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-black px-3 py-1.5 rounded-lg">
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">مغادرة</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative bg-gray-950 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center z-10">
                <div className="w-28 h-28 rounded-full bg-navy-700 flex items-center justify-center text-white text-5xl font-black mx-auto mb-3 ring-4 ring-orange-500 ring-offset-4 ring-offset-gray-950">
                  أ
                </div>
                <p className="text-white font-black text-lg">أحمد محمد</p>
                <p className="text-gray-400 text-sm mt-1">جارٍ البث المباشر...</p>
              </div>
            </div>

            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <span className="bg-red-500/90 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1">
                <Radio className="w-3 h-3" /> LIVE
              </span>
              <span className="bg-black/60 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3 text-orange-400" /> {elapsed}
              </span>
            </div>

            {handRaised && (
              <div className="absolute top-3 left-3 z-20 bg-yellow-500/90 text-white text-xs font-black px-3 py-1.5 rounded-full animate-pulse flex items-center gap-1">
                <Hand className="w-3.5 h-3.5" /> يدك مرفوعة
              </div>
            )}

            {emojiAnim.map(e => (
              <div key={e.id} className="absolute bottom-20 pointer-events-none z-30 animate-bounce"
                style={{ left: `${e.x}%`, transform: 'translateX(-50%)' }}>
                <span className="text-3xl drop-shadow-lg">{e.emoji}</span>
              </div>
            ))}

            {camOn && localStream && (
              <div className="absolute bottom-4 left-4 z-20 w-32 aspect-video rounded-xl overflow-hidden border-2 border-orange-500 bg-gray-900">
                <video ref={selfVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={dark ? { backgroundColor: 'var(--dk-elevated)' } : { backgroundColor: '#1e293b' }}>
            <div className="flex items-center gap-2">
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => sendEmoji(emoji)}
                  className="text-xl hover:scale-125 transition-transform active:scale-110">
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleRaiseHand}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-black transition-all ${handRaised ? 'bg-yellow-500 text-white shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                <Hand className="w-4 h-4" />
                <span className="hidden sm:inline">{handRaised ? 'نزّل يدك' : 'ارفع يد'}</span>
              </button>
              <button onClick={toggleMic}
                className={`p-2.5 rounded-xl transition-all ${micOn ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                title={micOn ? 'أوقف الميك' : 'شغّل الميك'}>
                {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button onClick={toggleCam}
                className={`p-2.5 rounded-xl transition-all ${camOn ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                title={camOn ? 'أوقف الكاميرا' : 'شغّل الكاميرا'}>
                {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button onClick={() => setMuted(v => !v)}
                className={`p-2.5 rounded-xl transition-all ${muted ? 'bg-red-500/40 text-red-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {showChat && (
          <div className={`w-64 lg:w-72 flex-shrink-0 flex flex-col border-r ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${dark ? 'border-[var(--dk-border)]' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <MessageCircle className={`w-4 h-4 ${dark ? 'text-amber-400' : 'text-orange-500'}`} />
                <span className={`text-sm font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الدردشة</span>
              </div>
              <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{msgs.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {msgs.map(m => (
                <div key={m.id} className={`flex flex-col gap-0.5 ${m.type === 'me' ? 'items-end' : 'items-start'}`}>
                  <span className={`text-xs font-black ${m.type === 'teacher' ? 'text-orange-500' : m.type === 'me' ? dark ? 'text-amber-400' : 'text-blue-600' : dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                    {m.type === 'teacher' && '🎓 '}{m.sender}
                  </span>
                  <div className={`px-3 py-2 rounded-xl text-sm max-w-[90%] ${m.type === 'teacher' ? 'bg-orange-500 text-white' : m.type === 'me' ? dark ? 'bg-amber-500/20 text-[var(--dk-text)]' : 'bg-blue-500 text-white' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)]' : 'bg-white text-navy-700 shadow-sm'}`}>
                    {m.msg}
                  </div>
                  <span className={`text-[10px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`}>{fmtTime(m.ts)}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className={`flex items-center gap-2 px-3 py-3 border-t flex-shrink-0 ${dark ? 'border-[var(--dk-border)]' : 'border-gray-200'}`}>
              <input className="input-field flex-1 text-sm py-2" placeholder="اكتب تعليقاً..."
                value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMsg()} maxLength={200} />
              <button onClick={sendMsg} disabled={!chatMsg.trim()}
                className="p-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg flex-shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentLiveStream() {
  const { dark } = useTheme();
  const [step, setStep] = useState('lobby'); // lobby | device | connecting | live
  const [selectedStream, setSelectedStream] = useState(null);
  const [devConf, setDevConf] = useState(null);

  const handleClickJoin = (stream) => { setSelectedStream(stream); setStep('device'); };

  const handleDeviceConfirm = (stream, conf) => {
    setDevConf(conf);
    setStep('connecting');
    setTimeout(() => { setStep('live'); toast.success('🎓 انضممت للبث!'); }, 1500);
  };

  const handleLeave = () => {
    setStep('lobby');
    setSelectedStream(null);
    setDevConf(null);
    toast('غادرت البث 👋', { duration: 2000 });
  };

  if (step === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: 'calc(100vh - 57px)' }} dir="rtl">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
        <p className={`text-lg font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>جاري الاتصال...</p>
        <p className={`text-sm mt-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>انتظر لحظة</p>
      </div>
    );
  }

  if (step === 'live' && selectedStream) {
    return <LiveView stream={selectedStream} devConf={devConf} onLeave={handleLeave} dark={dark} />;
  }

  if (step === 'device' && selectedStream) {
    return (
      <div className="p-4 lg:p-6 overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }} dir="rtl">
        <DeviceCheckScreen stream={selectedStream} onJoin={handleDeviceConfirm} onBack={() => setStep('lobby')} dark={dark} />
      </div>
    );
  }

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100 shadow-sm';

  return (
    <div className="p-4 lg:p-6 space-y-6 overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }} dir="rtl">
      <div>
        <h1 className={`text-2xl font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>البث المباشر 🔴</h1>
        <p className={`text-sm mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>انضم للجلسات التعليمية المباشرة مع أستاذك</p>
      </div>

      {MOCK_STREAMS.length > 0 ? (
        <div>
          <p className={`text-sm font-black mb-3 flex items-center gap-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
            الجلسات المتاحة الآن
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOCK_STREAMS.map(stream => (
              <div key={stream.id} className={`rounded-2xl border overflow-hidden ${card}`}>
                <div className="relative bg-gradient-to-br from-navy-700 to-indigo-900 p-8 text-center">
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #f97316 0%, transparent 60%)' }} />
                  <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-xs font-black px-3 py-1.5 rounded-full animate-pulse mb-4">
                    <Radio className="w-3.5 h-3.5" /> مباشر الآن
                  </span>
                  <h3 className="text-white font-black text-lg mb-1">{stream.title}</h3>
                  <p className="text-navy-200 text-sm mb-4">{stream.teacherName}</p>
                  <div className="flex items-center justify-center gap-4 text-xs font-bold text-navy-300 mb-5">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-orange-400" /> {stream.viewersCount}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-orange-400" /> منذ {fmtElapsed(stream.startedAt)}</span>
                  </div>
                  <button onClick={() => handleClickJoin(stream)}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-black px-8 py-3 rounded-xl flex items-center gap-2 mx-auto transition-all shadow-lg shadow-orange-500/30 hover:scale-105">
                    <LogIn className="w-5 h-5" /> انضم للبث
                  </button>
                </div>
                <div className={`px-5 py-3 flex justify-center ${dark ? '' : ''}`}>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold">{stream.stage}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`rounded-2xl border p-12 text-center ${card}`}>
          <Radio className={`w-12 h-12 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
          <p className={`text-lg font-black mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>لا يوجد بث مباشر الآن</p>
          <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>هيظهر هنا لما الأستاذ يبدأ جلسة مباشرة</p>
        </div>
      )}

      <div className={`rounded-2xl border p-5 ${card}`}>
        <h2 className={`text-sm font-black mb-3 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>إرشادات قبل الدخول</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Settings, text: 'اتأكد من الكاميرا والميك قبل ما تنضم', color: 'text-green-500 bg-green-50' },
            { icon: Hand, text: 'ارفع يدك لو عاوز تتكلم مع الأستاذ', color: 'text-yellow-500 bg-yellow-50' },
            { icon: MessageCircle, text: 'استخدم الدردشة للأسئلة الكتابية', color: 'text-blue-500 bg-blue-50' },
            { icon: AlertTriangle, text: 'تسجيل البث ممنوع إلا بإذن الأستاذ', color: 'text-red-500 bg-red-50' },
          ].map(({ icon: Icon, text, color }) => (
            <div key={text} className="flex items-center gap-3">
              <span className={`p-2 rounded-xl flex-shrink-0 ${color}`}><Icon className="w-4 h-4" /></span>
              <p className={`text-sm font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
