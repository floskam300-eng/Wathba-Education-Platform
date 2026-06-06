import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Room, RoomEvent, Track, ParticipantEvent, VideoPresets,
} from 'livekit-client';
import api from '../lib/api';
import {
  Mic, MicOff, Video, VideoOff,
  Monitor, MonitorOff, AlertCircle, Radio, WifiOff,
} from 'lucide-react';

/* ── Shared keyframe (injected once into <head>) ─────────── */
const STYLE_ID = 'livekit-room-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes lk-spin    { to { transform: rotate(360deg); } }
    @keyframes lk-pulse   { 0%,100%{opacity:1} 50%{opacity:0.55} }
  `;
  document.head.appendChild(s);
}

const MAX_MANUAL_RETRIES = 3;

/* ── Loading overlay ─────────────────────────────────────── */
function LoadingOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid rgba(249,115,22,0.2)',
        borderTopColor: '#f97316',
        animation: 'lk-spin 1s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'inherit', direction: 'rtl' }}>
        جارٍ الاتصال بغرفة البث...
      </p>
    </div>
  );
}

/* ── Error overlay ───────────────────────────────────────── */
function ErrorOverlay({ message, retryCount, onRetry }) {
  const canRetry = retryCount < MAX_MANUAL_RETRIES;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: 24,
    }}>
      <AlertCircle style={{ width: 40, height: 40, color: '#ef4444' }} />
      <p style={{
        color: 'rgba(255,255,255,0.8)', fontSize: 14,
        fontFamily: 'inherit', textAlign: 'center', direction: 'rtl',
        maxWidth: 320, lineHeight: 1.6,
      }}>
        {message}
      </p>
      {retryCount > 0 && (
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'inherit', direction: 'rtl' }}>
          محاولة {retryCount} من {MAX_MANUAL_RETRIES}
        </p>
      )}
      {onRetry && canRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 8,
            background: '#f97316', color: 'white', border: 'none',
            borderRadius: 10, padding: '8px 20px',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit', direction: 'rtl',
          }}
        >
          إعادة المحاولة
        </button>
      )}
      {!canRetry && (
        <p style={{ color: 'rgba(249,115,22,0.7)', fontSize: 12, fontFamily: 'inherit', direction: 'rtl' }}>
          تحقق من اتصال الإنترنت أو تواصل مع المسؤول
        </p>
      )}
    </div>
  );
}

/* ── Reconnecting overlay ────────────────────────────────── */
function ReconnectingOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <WifiOff style={{ width: 36, height: 36, color: '#f97316' }} />
      <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'inherit', direction: 'rtl' }}>
        جارٍ إعادة الاتصال...
      </p>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(249,115,22,0.2)',
        borderTopColor: '#f97316',
        animation: 'lk-spin 1s linear infinite',
      }} />
    </div>
  );
}

/* ── No-video placeholder ────────────────────────────────── */
function NoVideoPlaceholder({ isTeacher }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      background: '#0d0d1a',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(249,115,22,0.08)',
        border: '2px solid rgba(249,115,22,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Radio style={{ width: 32, height: 32, color: 'rgba(249,115,22,0.5)' }} />
      </div>
      <p style={{
        color: 'rgba(255,255,255,0.4)', fontSize: 13,
        fontFamily: 'inherit', direction: 'rtl',
      }}>
        {isTeacher ? 'الكاميرا معطلة' : 'في انتظار المعلم...'}
      </p>
    </div>
  );
}

/* ── Audio element (auto-play remote audio) ──────────────── */
function AudioEl({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { try { track.detach(el); } catch (_) {} };
  }, [track]);
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
}

/* ── Video element (attached to a LiveKit track) ─────────── */
function VideoEl({ track, muted = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { try { track.detach(el); } catch (_) {} };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

/* ── Teacher local video ─────────────────────────────────── */
function LocalVideoEl({ room, version }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const activePub = screenPub?.track ? screenPub : cameraPub?.track ? cameraPub : null;
    if (!activePub?.track) return;
    activePub.track.attach(el);
    return () => { try { activePub.track.detach(el); } catch (_) {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, version]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

/* ── Control button ──────────────────────────────────────── */
function CtrlBtn({ onClick, active, inactiveColor = '#ef4444', icon: Icon, label, pulse = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 10, border: 'none',
        background: active ? 'rgba(255,255,255,0.12)' : inactiveColor,
        color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700,
        fontFamily: 'inherit', transition: 'background 0.2s',
        animation: pulse ? 'lk-pulse 2s infinite' : 'none',
      }}
    >
      <Icon style={{ width: 15, height: 15 }} />
      {label}
    </button>
  );
}

/* ── Enable-audio button (browser autoplay policy) ───────── */
function AudioUnlockBtn({ room, onUnlocked }) {
  return (
    <div style={{
      position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
      zIndex: 30,
    }}>
      <button
        onClick={async () => {
          try { await room.startAudio(); } catch (_) {}
          onUnlocked();
        }}
        style={{
          background: '#f97316', color: 'white', border: 'none', borderRadius: 10,
          padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit', direction: 'rtl',
        }}
      >
        🔊 انقر لتفعيل الصوت
      </button>
    </div>
  );
}

/* ── LiveKit ReconnectPolicy (correct SDK interface) ─────── */
const wathbaReconnectPolicy = {
  nextRetryDelayInMs(context) {
    // Stop after 6 automatic retries (~2 minutes total)
    if (context.retryCount >= 6) return null;
    // Exponential backoff: 1s, 2s, 4s, 8s, 15s, 15s
    return Math.min(1000 * Math.pow(2, context.retryCount), 15000);
  },
};

/* ════════════════════════════════════════════════════════════
   Main LiveKitRoom Component
   Self-Hosted LiveKit — wathba.site
   ════════════════════════════════════════════════════════════ */
export default function LiveKitRoom({
  streamId,
  isTeacher,
  canSpeak = false,
  canShareScreen = false,
  style = {},
}) {
  const [status, setStatus]         = useState('loading');
  const [error, setError]           = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);

  // Room created once and persisted across re-renders via ref
  const roomRef = useRef(null);
  if (!roomRef.current) {
    roomRef.current = new Room({
      adaptiveStream: true,
      dynacast:       true,
      reconnectPolicy: wathbaReconnectPolicy,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      },
      publishDefaults: {
        simulcast:  true,
        videoCodec: 'vp8',
      },
    });
  }
  const room = roomRef.current;

  const mountedRef = useRef(false);

  const [micEnabled,    setMicEnabled]    = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localVersion,  setLocalVersion]  = useState(0);

  const [studentMic,    setStudentMic]    = useState(false);
  const [studentScreen, setStudentScreen] = useState(false);

  const [remoteVideoTrack,  setRemoteVideoTrack]  = useState(null);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState(null);
  const [remoteAudioTrack,  setRemoteAudioTrack]  = useState(null);
  const [audioLocked,       setAudioLocked]       = useState(false);

  /* ─────────────────────────────────────────────────────────
     Connect — fetches JWT from main platform, then connects
     to the self-hosted LiveKit VPS.
     FIX: disconnects existing connection before reconnecting.
  ───────────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    // FIX: always disconnect cleanly before a new connect attempt
    try { room.disconnect(); } catch (_) {}

    setStatus('loading');
    setError(null);

    // ── 1. Get JWT from main platform API ──────────────────
    let data;
    try {
      const resp = await api.post(`/live/${streamId}/livekit-token`);
      data = resp.data;
    } catch (apiErr) {
      if (!mountedRef.current) return;
      const serverMsg = apiErr?.response?.data?.error || apiErr?.message || 'خطأ في الاتصال';
      setError(`تعذّر الحصول على رمز الدخول: ${serverMsg}`);
      setStatus('error');
      return;
    }

    if (!mountedRef.current) return;

    if (!data?.token || !data?.serverUrl) {
      setError('خدمة البث غير مهيأة — تواصل مع المسؤول');
      setStatus('error');
      return;
    }

    // ── 2. Wire Room events ────────────────────────────────
    // Remove all listeners to avoid duplicates on retry
    room.removeAllListeners();

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (!mountedRef.current) return;
      if (track.kind === Track.Kind.Audio) {
        setRemoteAudioTrack(track);
      } else if (track.kind === Track.Kind.Video) {
        if (track.source === Track.Source.ScreenShare) setRemoteScreenTrack(track);
        else setRemoteVideoTrack(track);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (!mountedRef.current) return;
      if (track.kind === Track.Kind.Audio) {
        setRemoteAudioTrack(t => t?.sid === track.sid ? null : t);
      } else if (track.source === Track.Source.ScreenShare) {
        setRemoteScreenTrack(t => t?.sid === track.sid ? null : t);
      } else {
        setRemoteVideoTrack(t => t?.sid === track.sid ? null : t);
      }
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (mountedRef.current) setAudioLocked(!room.canPlaybackAudio);
    });

    room.on(RoomEvent.Reconnecting, () => {
      if (mountedRef.current) setReconnecting(true);
    });

    room.on(RoomEvent.Reconnected, () => {
      if (mountedRef.current) {
        setReconnecting(false);
        setStatus('connected');
      }
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      if (!mountedRef.current) return;
      setReconnecting(false);
      // CLIENT_INITIATED = user left intentionally — don't show error
      if (reason && reason !== 'CLIENT_INITIATED') {
        setError('انقطع الاتصال بخادم البث');
        setStatus('error');
      }
    });

    room.localParticipant.on(ParticipantEvent.LocalTrackPublished,   () => {
      if (mountedRef.current) setLocalVersion(v => v + 1);
    });
    room.localParticipant.on(ParticipantEvent.LocalTrackUnpublished, () => {
      if (mountedRef.current) setLocalVersion(v => v + 1);
    });

    // ── 3. Connect to self-hosted LiveKit VPS ──────────────
    try {
      await room.connect(data.serverUrl, data.token);
    } catch (connErr) {
      if (!mountedRef.current) return;
      const msg = connErr?.message || 'unknown';
      const isAuthErr = msg.includes('403') || msg.includes('401') ||
                        msg.toLowerCase().includes('token') ||
                        msg.toLowerCase().includes('unauthorized');
      setError(isAuthErr
        ? 'رمز الدخول غير صالح — تحقق من إعدادات خادم البث'
        : `فشل الاتصال بخادم البث: ${msg}`
      );
      setStatus('error');
      return;
    }

    if (!mountedRef.current) { room.disconnect(); return; }

    // ── 4. Sync tracks already published (late joiners) ────
    room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        if (!pub.isSubscribed || !pub.track) return;
        if (pub.track.kind === Track.Kind.Audio) {
          setRemoteAudioTrack(pub.track);
        } else if (pub.track.kind === Track.Kind.Video) {
          if (pub.track.source === Track.Source.ScreenShare) setRemoteScreenTrack(pub.track);
          else setRemoteVideoTrack(pub.track);
        }
      });
    });

    setStatus('connected');
    setReconnecting(false);

    // ── 5. Teacher: start camera + mic ─────────────────────
    if (isTeacher) {
      try {
        await room.localParticipant.enableCameraAndMicrophone();
      } catch (mediaErr) {
        // Camera/mic permission denied — not fatal; teacher can still stream audio-only
        console.warn('[LiveKit] camera/mic unavailable:', mediaErr?.message);
      }
      if (mountedRef.current) setLocalVersion(v => v + 1);
    }
  }, [streamId, room, isTeacher]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      room.removeAllListeners();
      room.disconnect();
    };
  // connect is stable (useCallback with fixed deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Teacher controls ────────────────────────────────── */
  const toggleMic = useCallback(async () => {
    const next = !micEnabled;
    try { await room.localParticipant.setMicrophoneEnabled(next); } catch (_) {}
    setMicEnabled(next);
  }, [room, micEnabled]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraEnabled;
    try { await room.localParticipant.setCameraEnabled(next); } catch (_) {}
    setCameraEnabled(next);
    setLocalVersion(v => v + 1);
  }, [room, cameraEnabled]);

  const toggleScreen = useCallback(async () => {
    if (screenSharing) {
      try { await room.localParticipant.setScreenShareEnabled(false); } catch (_) {}
      setScreenSharing(false);
    } else {
      try {
        await room.localParticipant.setScreenShareEnabled(true);
        setScreenSharing(true);
      } catch (_) {}
    }
    setLocalVersion(v => v + 1);
  }, [room, screenSharing]);

  /* ── Student controls ────────────────────────────────── */
  const toggleStudentMic = useCallback(async () => {
    if (!canSpeak) return;
    const next = !studentMic;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setStudentMic(next);
    } catch (e) {
      console.warn('[LiveKit] student mic toggle failed:', e?.message);
    }
  }, [room, studentMic, canSpeak]);

  const toggleStudentScreen = useCallback(async () => {
    if (!canShareScreen) return;
    if (studentScreen) {
      try { await room.localParticipant.setScreenShareEnabled(false); } catch (_) {}
      setStudentScreen(false);
    } else {
      try {
        await room.localParticipant.setScreenShareEnabled(true);
        setStudentScreen(true);
      } catch (_) {}
    }
    setLocalVersion(v => v + 1);
  }, [room, studentScreen, canShareScreen]);

  // Auto-mute student when teacher revokes permissions
  useEffect(() => {
    if (!canSpeak && studentMic) {
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      setStudentMic(false);
    }
  }, [canSpeak]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canShareScreen && studentScreen) {
      room.localParticipant.setScreenShareEnabled(false).catch(() => {});
      setStudentScreen(false);
    }
  }, [canShareScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derived display state ───────────────────────────── */
  const hasLocalVideo = useMemo(() => {
    if (!isTeacher || status !== 'connected') return false;
    const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    return !!(screenPub?.track || cameraPub?.track);
  }, [isTeacher, status, localVersion]); // localVersion bumps when tracks change

  const hasRemoteVideo = !isTeacher && !!(remoteScreenTrack || remoteVideoTrack);

  /* ── Retry handler ───────────────────────────────────── */
  const handleRetry = useCallback(() => {
    if (retryCount >= MAX_MANUAL_RETRIES) return;
    setRetryCount(c => c + 1);
    connect();
  }, [retryCount, connect]);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: '#0a0a0a', overflow: 'hidden', ...style,
    }}>
      {status === 'loading' && <LoadingOverlay />}

      {status === 'error' && (
        <ErrorOverlay
          message={error}
          retryCount={retryCount}
          onRetry={handleRetry}
        />
      )}

      {reconnecting && status === 'connected' && <ReconnectingOverlay />}

      {status === 'connected' && (
        <>
          {/* ── Video area ── */}
          {isTeacher ? (
            hasLocalVideo
              ? <LocalVideoEl room={room} version={localVersion} />
              : <NoVideoPlaceholder isTeacher />
          ) : (
            hasRemoteVideo
              ? <VideoEl
                  track={remoteScreenTrack || remoteVideoTrack}
                  muted={false}
                  key={(remoteScreenTrack || remoteVideoTrack)?.sid}
                />
              : <NoVideoPlaceholder isTeacher={false} />
          )}

          {/* ── Remote audio (students only) ── */}
          {!isTeacher && remoteAudioTrack && (
            <AudioEl track={remoteAudioTrack} key={remoteAudioTrack.sid} />
          )}

          {/* ── Audio unlock (browser autoplay policy) ── */}
          {!isTeacher && audioLocked && (
            <AudioUnlockBtn room={room} onUnlocked={() => setAudioLocked(false)} />
          )}

          {/* ── Teacher controls bar ── */}
          {isTeacher && (
            <div style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 8, zIndex: 20,
              background: 'rgba(0,0,0,0.72)', padding: '8px 12px',
              borderRadius: 14, backdropFilter: 'blur(10px)',
            }}>
              <CtrlBtn
                onClick={toggleMic}
                active={micEnabled}
                icon={micEnabled ? Mic : MicOff}
                label={micEnabled ? 'كتم' : 'صوت'}
              />
              <CtrlBtn
                onClick={toggleCamera}
                active={cameraEnabled}
                icon={cameraEnabled ? Video : VideoOff}
                label={cameraEnabled ? 'إيقاف' : 'كاميرا'}
              />
              <CtrlBtn
                onClick={toggleScreen}
                active={!screenSharing}
                inactiveColor="#f97316"
                icon={screenSharing ? MonitorOff : Monitor}
                label={screenSharing ? 'إيقاف العرض' : 'مشاركة الشاشة'}
                pulse={screenSharing}
              />
            </div>
          )}

          {/* ── Student controls (only when teacher grants permission) ── */}
          {!isTeacher && (canSpeak || canShareScreen) && (
            <div style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 8, zIndex: 20,
              background: 'rgba(0,0,0,0.78)', padding: '8px 12px',
              borderRadius: 14, backdropFilter: 'blur(10px)',
            }}>
              {canSpeak && (
                <CtrlBtn
                  onClick={toggleStudentMic}
                  active={studentMic}
                  inactiveColor="#16a34a"
                  icon={studentMic ? Mic : MicOff}
                  label={studentMic ? 'كتم صوتك' : 'تحدث'}
                  pulse={studentMic}
                />
              )}
              {canShareScreen && (
                <CtrlBtn
                  onClick={toggleStudentScreen}
                  active={!studentScreen}
                  inactiveColor="#2563eb"
                  icon={studentScreen ? MonitorOff : Monitor}
                  label={studentScreen ? 'إيقاف الشاشة' : 'شارك شاشتك'}
                  pulse={studentScreen}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
