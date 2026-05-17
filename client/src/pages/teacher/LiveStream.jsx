import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  Video, VideoOff, Plus, Users, Radio, Clock, Eye, EyeOff,
  Trash2, X, StopCircle, GraduationCap, UserCheck, Globe,
  CalendarDays, Wifi, WifiOff, AlertTriangle, Bell,
  Mic, MicOff, Monitor, Settings2, ChevronLeft, ChevronRight,
  CheckCircle, Search, Filter, RefreshCw, Send
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useQuery } from '@tanstack/react-query';

const STAGES = [
  'الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي',
  'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي',
];

const ACCESS_TYPES = [
  { value: 'all',      icon: Globe,        label: 'كل الطلاب',          desc: 'جميع طلابك يقدرون يدخلوا' },
  { value: 'stages',   icon: GraduationCap, label: 'سنوات دراسية',      desc: 'اختر الصفوف المسموح لها' },
  { value: 'specific', icon: UserCheck,    label: 'طلاب بعينهم',        desc: 'اختر الطلاب من القائمة' },
];

const MOCK_PAST = [
  { id: 1, title: 'مراجعة الجبر — الوحدة الثالثة', date: '2026-05-15T18:00:00', duration: 72, viewers: 34, access: 'all', status: 'ended' },
  { id: 2, title: 'شرح المثلثات', date: '2026-05-10T17:30:00', duration: 55, viewers: 21, access: 'stages', stages: ['الصف الثاني الثانوي'], status: 'ended' },
];

const MOCK_SCHEDULED = [
  { id: 10, title: 'حل مسائل — الفصل الخامس', date: '2026-05-20T17:00:00', access: 'all' },
];

const emptyForm = {
  title: '', description: '',
  access: 'all', stages: [], selectedStudents: [],
  scheduled: false, scheduleDate: '', scheduleTime: '',
  chat: true, handRaise: true, maxViewers: '', recordingAllowed: false,
};

function Bdg({ children, color = 'gray' }) {
  const c = { green: 'bg-green-100 text-green-700', red: 'bg-red-100 text-red-700', orange: 'bg-orange-100 text-orange-700', gray: 'bg-gray-100 text-gray-600', blue: 'bg-blue-100 text-blue-700', yellow: 'bg-yellow-100 text-yellow-700' };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${c[color]}`}>{children}</span>;
}

function MicMeter({ stream }) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    if (!stream) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, (avg / 128) * 200));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(rafRef.current);
        ctx.close();
      };
    } catch { /* no mic */ }
  }, [stream]);

  const bars = 20;
  return (
    <div className="flex items-center gap-0.5 h-5">
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className={`w-1.5 rounded-full transition-all duration-75 ${i < (level / 100) * bars ? 'bg-green-500' : 'bg-gray-300'}`}
          style={{ height: `${40 + (i / bars) * 60}%` }} />
      ))}
    </div>
  );
}

function DeviceCheck({ onConfirm, onBack, dark }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selCam, setSelCam] = useState('');
  const [selMic, setSelMic] = useState('');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const startStream = useCallback(async (camId, micId, cOn, mOn) => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    try {
      const constraints = {
        video: cOn ? (camId ? { deviceId: { exact: camId } } : true) : false,
        audio: mOn ? (micId ? { deviceId: { exact: micId } } : true) : false,
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.muted = true; }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter(d => d.kind === 'videoinput'));
      setMics(devices.filter(d => d.kind === 'audioinput'));
      setError('');
    } catch (e) {
      setError('تعذّر الوصول للكاميرا أو الميكروفون. تأكد من الإذن.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    startStream('', '', true, true);
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);

  const handleCamToggle = () => {
    const next = !camOn;
    setCamOn(next);
    startStream(selCam, selMic, next, micOn);
  };
  const handleMicToggle = () => {
    const next = !micOn;
    setMicOn(next);
    startStream(selCam, selMic, camOn, next);
  };
  const handleCamChange = (id) => { setSelCam(id); startStream(id, selMic, camOn, micOn); };
  const handleMicChange = (id) => { setSelMic(id); startStream(selCam, id, camOn, micOn); };

  const handleConfirm = () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    onConfirm({ camOn, micOn, selCam, selMic });
  };

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100 shadow-sm';
  const el = dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100';

  return (
    <div className={`rounded-2xl border p-6 ${card}`} dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className={`p-2 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-500 hover:bg-gray-100'}`}>
          <ChevronRight className="w-5 h-5" />
        </button>
        <div>
          <h2 className={`text-lg font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>فحص الكاميرا والميكروفون</h2>
          <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>اتأكد من إعداداتك قبل بدء البث</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-950 flex items-center justify-center">
            {loading && <div className="text-gray-400 text-sm font-bold animate-pulse">جاري تهيئة الكاميرا...</div>}
            {error && !loading && (
              <div className="text-center px-4">
                <VideoOff className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <p className="text-red-300 text-xs font-bold">{error}</p>
              </div>
            )}
            {!camOn && !error && (
              <div className="text-center">
                <VideoOff className="w-10 h-10 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400 text-sm font-bold">الكاميرا مغلقة</p>
              </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted
              className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${(!camOn || error) ? 'hidden' : ''}`} />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button onClick={handleCamToggle}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${camOn ? 'bg-orange-500 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`}>
                {camOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={handleMicToggle}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${micOn ? 'bg-orange-500 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`}>
                {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {micOn && stream && (
            <div className={`flex items-center gap-3 p-3 rounded-xl ${el}`}>
              <Mic className={`w-4 h-4 flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`} />
              <div className="flex-1"><MicMeter stream={stream} /></div>
              <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>مستوى الصوت</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-black mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
              <Video className="w-4 h-4 inline-block ml-1" />الكاميرا
            </label>
            <select value={selCam} onChange={e => handleCamChange(e.target.value)} className="input-field w-full" disabled={!camOn}>
              <option value="">الكاميرا الافتراضية</option>
              {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || `كاميرا ${c.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-black mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
              <Mic className="w-4 h-4 inline-block ml-1" />الميكروفون
            </label>
            <select value={selMic} onChange={e => handleMicChange(e.target.value)} className="input-field w-full" disabled={!micOn}>
              <option value="">الميكروفون الافتراضي</option>
              {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `ميكروفون ${m.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </div>

          <div className={`rounded-xl p-4 space-y-3 ${el}`}>
            <p className={`text-xs font-black mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>حالة الأجهزة</p>
            {[
              { icon: camOn ? Video : VideoOff, label: 'الكاميرا', ok: camOn && !error },
              { icon: micOn ? Mic : MicOff, label: 'الميكروفون', ok: micOn && !error },
            ].map(({ icon: Icon, label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${ok ? 'text-green-500' : 'text-gray-400'}`} />
                <span className={`text-sm font-bold flex-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{label}</span>
                <span className={`text-xs font-bold ${ok ? 'text-green-600' : 'text-gray-400'}`}>{ok ? 'جاهز ✓' : 'مغلق'}</span>
              </div>
            ))}
          </div>

          <button onClick={handleConfirm} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
            <Radio className="w-4 h-4" />
            ابدأ البث الآن
          </button>
          <button onClick={onBack} className="btn-secondary w-full">رجوع للإعدادات</button>
        </div>
      </div>
    </div>
  );
}

function StudentPicker({ students, selectedIds, onToggle, onSelectAll, dark }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('الكل');

  const stages = ['الكل', ...new Set(students.map(s => s.academic_stage).filter(Boolean))];
  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search) || (s.code || '').includes(search);
    const matchStage = stageFilter === 'الكل' || s.academic_stage === stageFilter;
    return matchSearch && matchStage;
  });

  const el = dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-white border-gray-200';
  const surface = dark ? 'bg-[var(--dk-surface)]' : 'bg-gray-50';

  return (
    <div className={`rounded-xl border overflow-hidden ${el}`}>
      <div className={`p-3 border-b space-y-2 ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-surface)]' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-black flex items-center gap-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
            <Users className="w-3.5 h-3.5 text-orange-500" />
            اختر الطلاب
            {selectedIds.length > 0 && <span className="bg-orange-100 text-orange-700 px-1.5 rounded-full">{selectedIds.length}</span>}
          </span>
          <button onClick={() => onSelectAll(filtered.map(s => s.id))}
            className={`text-xs font-bold ${dark ? 'text-amber-400' : 'text-orange-600'} hover:underline`}>
            {selectedIds.length === filtered.length && filtered.length > 0 ? 'إلغاء الكل' : 'تحديد الكل'}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pr-8 text-sm w-full" placeholder="بحث بالاسم أو الكود..." />
        </div>
        {stages.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {stages.map(stage => (
              <button key={stage} onClick={() => setStageFilter(stage)}
                className={`text-xs font-bold px-2 py-0.5 rounded-full transition-all border ${stageFilter === stage ? 'bg-navy-600 text-white border-navy-600' : dark ? 'border-[var(--dk-border)] text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                {stage} <span className="opacity-60">({stage === 'الكل' ? students.length : students.filter(s => s.academic_stage === stage).length})</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`overflow-y-auto max-h-52 divide-y ${dark ? 'divide-[var(--dk-border)]' : 'divide-gray-50'}`}>
        {filtered.length === 0 ? (
          <p className={`text-center py-6 text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد نتائج</p>
        ) : filtered.map(s => (
          <label key={s.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all ${selectedIds.includes(s.id) ? dark ? 'bg-orange-500/10' : 'bg-orange-50' : dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}>
            <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => onToggle(s.id)} className="w-4 h-4 accent-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{s.name}</p>
              <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{s.academic_stage}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function ActiveStream({ stream, onEnd, dark }) {
  const videoRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [chatOn, setChatOn] = useState(stream.chat);
  const [handOn, setHandOn] = useState(stream.handRaise);
  const [camOn, setCamOn] = useState(stream.devCamOn ?? true);
  const [micOn, setMicOn] = useState(stream.devMicOn ?? true);
  const [localStream, setLocalStream] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 60000);
    const v = setInterval(() => setViewers(c => c + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0)), 15000);
    return () => { clearInterval(t); clearInterval(v); };
  }, []);

  useEffect(() => {
    if (!camOn && !micOn) return;
    navigator.mediaDevices.getUserMedia({ video: camOn, audio: micOn })
      .then(s => {
        setLocalStream(s);
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.muted = true; }
      }).catch(() => {});
    return () => { if (localStream) localStream.getTracks().forEach(t => t.stop()); };
  }, []);

  const toggleCam = () => {
    if (localStream) localStream.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(v => !v);
  };
  const toggleMic = () => {
    if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(v => !v);
  };

  const sendNotif = () => toast.success('📣 تم إرسال إشعار لجميع الطلاب المسموح لهم!');

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100 shadow-sm';
  const el = dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-100';

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`rounded-2xl border-2 border-red-500 overflow-hidden ${dark ? 'bg-red-500/5' : 'bg-red-50/50'}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-red-200/30 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-black px-3 py-1.5 rounded-full animate-pulse">
              <Radio className="w-3.5 h-3.5" /> مباشر الآن
            </span>
            <h2 className={`text-base font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>{stream.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={sendNotif}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${dark ? 'border-[var(--dk-border)] text-amber-400 hover:bg-[var(--dk-elevated)]' : 'border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100'}`}>
              <Bell className="w-3.5 h-3.5" /> إشعار للطلاب
            </button>
            <button onClick={onEnd}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-colors">
              <StopCircle className="w-4 h-4" /> إنهاء البث
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-5">
          <div className="lg:col-span-2 space-y-3">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-950">
              {!camOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 bg-navy-700 rounded-full flex items-center justify-center text-white text-3xl font-black mb-2 ring-4 ring-orange-500">أ</div>
                  <p className="text-gray-300 text-sm font-bold">الكاميرا مغلقة</p>
                </div>
              )}
              <video ref={videoRef} autoPlay playsInline muted
                className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${!camOn ? 'hidden' : ''}`} />
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="flex items-center gap-1 bg-red-500/90 text-white text-xs font-black px-2 py-1 rounded-full animate-pulse">
                  <Radio className="w-3 h-3" /> LIVE
                </span>
                <span className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3 text-orange-400" /> {elapsed} د
                </span>
              </div>
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <Eye className="w-3 h-3 text-blue-400" /> {viewers} مشاهد
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={toggleMic}
                className={`p-3 rounded-xl transition-all ${micOn ? 'bg-orange-500 text-white' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-200 text-gray-500'}`}>
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button onClick={toggleCam}
                className={`p-3 rounded-xl transition-all ${camOn ? 'bg-orange-500 text-white' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-200 text-gray-500'}`}>
                {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { icon: Users, label: 'المشاهدون', value: viewers, color: 'text-blue-500' },
              { icon: Clock, label: 'المدة', value: `${elapsed} دقيقة`, color: 'text-green-500' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className={`rounded-xl p-3 border text-center ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'bg-white border-gray-100'}`}>
                <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                <p className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{label}</p>
                <p className={`text-sm font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{value}</p>
              </div>
            ))}
            <div className={`rounded-xl p-3 border space-y-2 ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'bg-white border-gray-100'}`}>
              <p className={`text-xs font-black ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>إعدادات البث</p>
              {[
                { label: 'الدردشة', state: chatOn, toggle: () => setChatOn(v => !v) },
                { label: 'رفع اليد', state: handOn, toggle: () => setHandOn(v => !v) },
              ].map(({ label, state, toggle }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{label}</span>
                  <button onClick={toggle}
                    className={`relative w-9 h-5 rounded-full transition-all ${state ? 'bg-orange-500' : dark ? 'bg-[var(--dk-border)]' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${state ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeacherLiveStream() {
  const { dark } = useTheme();
  const [step, setStep] = useState('idle'); // idle | form | device | live
  const [form, setForm] = useState(emptyForm);
  const [activeLive, setActiveLive] = useState(null);
  const [pastStreams, setPastStreams] = useState(MOCK_PAST);
  const [scheduled, setScheduled] = useState(MOCK_SCHEDULED);
  const [deviceConf, setDeviceConf] = useState(null);

  const { data: students = [] } = useQuery({
    queryKey: ['all-students-live'],
    queryFn: () => api.get('/teachers/students').then(r => r.data.students || r.data),
    retry: false,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleStage = (stage) => set('stages', form.stages.includes(stage) ? form.stages.filter(s => s !== stage) : [...form.stages, stage]);
  const toggleStudent = (id) => set('selectedStudents', form.selectedStudents.includes(id) ? form.selectedStudents.filter(x => x !== id) : [...form.selectedStudents, id]);
  const selectAllStudents = (ids) => set('selectedStudents', form.selectedStudents.length === ids.length && ids.length > 0 ? [] : ids);

  const handleGoToDevice = () => {
    if (!form.title.trim()) return toast.error('أدخل عنوان البث أولاً');
    if (form.access === 'stages' && form.stages.length === 0) return toast.error('اختر سنة دراسية واحدة على الأقل');
    if (form.access === 'specific' && form.selectedStudents.length === 0) return toast.error('اختر طالباً واحداً على الأقل');
    if (form.scheduled && (!form.scheduleDate || !form.scheduleTime)) return toast.error('حدد تاريخ ووقت الجدولة');
    setStep('device');
  };

  const handleSchedule = () => {
    if (!form.title.trim()) return toast.error('أدخل عنوان البث أولاً');
    if (!form.scheduleDate || !form.scheduleTime) return toast.error('حدد تاريخ ووقت الجدولة');
    setScheduled(prev => [{ id: Date.now(), title: form.title, date: `${form.scheduleDate}T${form.scheduleTime}`, access: form.access, stages: form.stages }, ...prev]);
    setForm(emptyForm);
    setStep('idle');
    toast.success('✅ تم جدولة البث بنجاح! سيتم إرسال إشعار للطلاب قبله بساعة.');
  };

  const handleDeviceConfirm = (conf) => {
    setDeviceConf(conf);
    const roomId = `wathba-${Date.now().toString(36)}`;
    const live = { ...form, roomId, startedAt: new Date(), id: Date.now(), devCamOn: conf.camOn, devMicOn: conf.micOn };
    setActiveLive(live);
    setStep('live');
    toast.success('🔴 البث المباشر بدأ! تم إرسال إشعارات للطلاب 📣');
  };

  const handleEndLive = () => {
    setPastStreams(prev => [{ ...activeLive, date: activeLive.startedAt, duration: 1, viewers: 0, status: 'ended' }, ...prev]);
    setActiveLive(null);
    setForm(emptyForm);
    setStep('idle');
    toast.success('تم إنهاء البث');
  };

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100 shadow-sm';

  const fmtDate = (d) => new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>البث المباشر 🔴</h1>
          <p className={`text-sm mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>ابدأ جلسة تعليمية مباشرة مع طلابك</p>
        </div>
        {step === 'idle' && !activeLive && (
          <button onClick={() => setStep('form')} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> بث جديد
          </button>
        )}
      </div>

      {step === 'live' && activeLive && (
        <ActiveStream stream={activeLive} onEnd={handleEndLive} dark={dark} />
      )}

      {step === 'device' && (
        <DeviceCheck onConfirm={handleDeviceConfirm} onBack={() => setStep('form')} dark={dark} />
      )}

      {step === 'form' && (
        <div className={`rounded-2xl border p-6 ${card}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-lg font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>إعدادات البث الجديد</h2>
            <button onClick={() => { setStep('idle'); setForm(emptyForm); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-black mb-1.5 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>عنوان الجلسة *</label>
                <input className="input-field w-full" placeholder="مثال: مراجعة الجبر — الفصل الثاني" value={form.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div>
                <label className={`block text-sm font-black mb-1.5 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>وصف مختصر (اختياري)</label>
                <input className="input-field w-full" placeholder="موضوع الجلسة..." value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <label className={`text-sm font-black flex items-center gap-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  <CalendarDays className="w-4 h-4 text-orange-500" /> جدولة البث مسبقاً
                </label>
                <button type="button" onClick={() => set('scheduled', !form.scheduled)}
                  className={`relative w-10 h-6 rounded-full transition-all ${form.scheduled ? 'bg-orange-500' : dark ? 'bg-[var(--dk-border)]' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.scheduled ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
              {form.scheduled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>التاريخ</label>
                    <input type="date" className="input-field w-full" value={form.scheduleDate} onChange={e => set('scheduleDate', e.target.value)} min={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>الوقت</label>
                    <input type="time" className="input-field w-full" value={form.scheduleTime} onChange={e => set('scheduleTime', e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className={`block text-sm font-black mb-3 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>من يقدر يدخل البث؟ *</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ACCESS_TYPES.map(({ value, icon: Icon, label, desc }) => (
                  <button key={value} type="button" onClick={() => set('access', value)}
                    className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-right transition-all ${form.access === value ? 'border-orange-500 bg-orange-50' : dark ? 'border-[var(--dk-border)] hover:border-orange-400/40' : 'border-gray-200 hover:border-orange-200 bg-gray-50'}`}>
                    <div className={`p-2 rounded-lg ${form.access === value ? 'bg-orange-500 text-white' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-white text-gray-500'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-sm font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{label}</p>
                      <p className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {form.access === 'stages' && (
              <div>
                <label className={`block text-sm font-black mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>اختر السنوات الدراسية</label>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map(stage => (
                    <button key={stage} type="button" onClick={() => toggleStage(stage)}
                      className={`px-3 py-2 rounded-xl text-sm font-bold transition-all border ${form.stages.includes(stage) ? 'border-orange-500 bg-orange-500 text-white shadow-md' : dark ? 'border-[var(--dk-border)] text-[var(--dk-text-2)] hover:border-orange-400/50' : 'border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                      {stage}
                    </button>
                  ))}
                </div>
                {form.stages.length === 0 && <p className="flex items-center gap-1 text-red-500 text-xs font-bold mt-2"><AlertTriangle className="w-3.5 h-3.5" /> اختر سنة واحدة على الأقل</p>}
              </div>
            )}

            {form.access === 'specific' && (
              <div>
                <label className={`block text-sm font-black mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  اختر الطلاب المسموح لهم {form.selectedStudents.length > 0 && <span className="text-orange-500">({form.selectedStudents.length} طالب)</span>}
                </label>
                <StudentPicker
                  students={students.length > 0 ? students : [
                    { id: 1, name: 'محمد علي', academic_stage: 'الصف الثاني الثانوي', code: 'STD-001' },
                    { id: 2, name: 'ياسمين سمير', academic_stage: 'الصف الثاني الثانوي', code: 'STD-002' },
                    { id: 3, name: 'عمر فاروق', academic_stage: 'الصف الأول الثانوي', code: 'STD-003' },
                    { id: 4, name: 'سارة أحمد', academic_stage: 'الصف الثالث الثانوي', code: 'STD-004' },
                    { id: 5, name: 'كريم حسن', academic_stage: 'الصف الأول الثانوي', code: 'STD-005' },
                  ]}
                  selectedIds={form.selectedStudents}
                  onToggle={toggleStudent}
                  onSelectAll={selectAllStudents}
                  dark={dark}
                />
              </div>
            )}

            <div>
              <label className={`block text-sm font-black mb-3 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>إعدادات التفاعل</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'chat', icon: '💬', label: 'دردشة الطلاب', desc: 'يسمح للطلاب بالتعليق' },
                  { key: 'handRaise', icon: '✋', label: 'رفع اليد', desc: 'يسمح للطلاب بطلب الكلام' },
                  { key: 'recordingAllowed', icon: '⏺️', label: 'تسجيل مسموح', desc: 'للطلاب فقط' },
                ].map(({ key, icon, label, desc }) => (
                  <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${form[key] ? dark ? 'border-orange-500/40 bg-orange-500/8' : 'border-orange-200 bg-orange-50' : dark ? 'border-[var(--dk-border)]' : 'border-gray-200'}`}>
                    <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)} className="w-4 h-4 accent-orange-500 flex-shrink-0" />
                    <span className="text-lg">{icon}</span>
                    <div>
                      <p className={`text-sm font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{label}</p>
                      <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-gray-100" style={dark ? { borderColor: 'var(--dk-border)' } : {}}>
              {form.scheduled ? (
                <button onClick={handleSchedule} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                  <CalendarDays className="w-4 h-4" /> جدولة البث
                </button>
              ) : (
                <button onClick={handleGoToDevice} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                  <Settings2 className="w-4 h-4" /> فحص الكاميرا وابدأ البث
                </button>
              )}
              <button onClick={() => { setStep('idle'); setForm(emptyForm); }} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {scheduled.length > 0 && step === 'idle' && (
        <div>
          <h2 className={`text-base font-black mb-3 flex items-center gap-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
            <CalendarDays className="w-4 h-4 text-orange-500" /> بثوث مجدولة
          </h2>
          <div className="space-y-2">
            {scheduled.map(s => (
              <div key={s.id} className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${card}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Bdg color="yellow"><CalendarDays className="w-3 h-3" /> مجدول</Bdg>
                    {s.access === 'all' && <Bdg color="blue"><Globe className="w-3 h-3" /> كل الطلاب</Bdg>}
                    {s.stages?.map(st => <span key={st} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-lg font-bold">{st}</span>)}
                  </div>
                  <p className={`font-black text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>{s.title}</p>
                  <p className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{fmtDate(s.date)}</p>
                </div>
                <button onClick={() => setScheduled(prev => prev.filter(x => x.id !== s.id))}
                  className={`p-2 rounded-xl flex-shrink-0 ${dark ? 'text-red-400/70 hover:bg-red-500/10' : 'text-red-400 hover:bg-red-50'}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'idle' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-base font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>البثوث السابقة</h2>
            {pastStreams.length > 0 && <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{pastStreams.length} جلسة</span>}
          </div>
          {pastStreams.length === 0 ? (
            <div className={`rounded-2xl border p-10 text-center ${card}`}>
              <Video className={`w-12 h-12 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
              <p className={`font-black ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لم تبدأ أي بث بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pastStreams.map(s => (
                <div key={s.id} className={`rounded-2xl border p-5 ${card}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1 mb-1">
                        <Bdg color="gray"><Clock className="w-3 h-3" /> منتهي</Bdg>
                        {s.access === 'all' && <Bdg color="blue"><Globe className="w-3 h-3" /> كل الطلاب</Bdg>}
                        {s.access === 'stages' && <Bdg color="orange"><GraduationCap className="w-3 h-3" /> سنوات محددة</Bdg>}
                      </div>
                      <h3 className={`font-black text-sm truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>{s.title}</h3>
                      <p className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{fmtDate(s.date)}</p>
                    </div>
                    <button onClick={() => setPastStreams(prev => prev.filter(x => x.id !== s.id))}
                      className={`p-2 rounded-xl flex-shrink-0 ${dark ? 'text-red-400/70 hover:bg-red-500/10' : 'text-red-400 hover:bg-red-50'}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className={`flex gap-4 text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                    <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {s.viewers} مشاهد</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.duration} دقيقة</span>
                  </div>
                  {s.stages && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.stages.map(st => <span key={st} className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold">{st}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
