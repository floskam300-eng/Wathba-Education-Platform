import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room, RoomEvent, Track, ParticipantEvent,
  VideoPresets, ConnectionState,
} from 'livekit-client';
import api from '../lib/api';
import {
  Mic, MicOff, Video, VideoOff,
  Monitor, MonitorOff, Loader2, AlertCircle, Radio, WifiOff,
} from 'lucide-react';

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
        animation: 'spin 1s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'inherit', direction: 'rtl' }}>
        جارٍ الاتصال بغرفة البث...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Error overlay ───────────────────────────────────────── */
function ErrorOverlay({ message, onRetry }) {
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
      {onRetry && (
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
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

/* ── Teacher local video (re-reads publication on version bump) */
function LocalVideoEl({ room, version }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const activePub = (screenPub?.track ? screenPub : cameraPub?.track ? cameraPub : null);

    if (!activePub?.track) return;
    activePub.track.attach(el);
    return () => { try { activePub.track.detach(el); } catch (_) {} };
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
        fontFamily: 'inherit', transition: 'all 0.2s',
        animation: pulse ? 'ctrlPulse 2s infinite' : 'none',
      }}
    >
      <Icon style={{ width: 15, height: 15 }} />
      {label}
    </button>
  );
}

/* ── Enable-audio button (for browser audio policy) ─────── */
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

/* ════════════════════════════════════════════════════════════
   Main LiveKitRoom Component
   Self-Hosted LiveKit — wathba.site
   ════════════════════════════════════════════════════════════ */
export default function LiveKitRoom({
  streamId,
  isTeacher,
  displayName,
  canSpeak = false,
  canShareScreen = false,
  style = {},
}) {
  const [status, setStatus]         = useState('loading');
  const [error, setError]           = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const roomRef = useRef(null);
  const mountedRef = useRef(true);

  // Create room once
  if (!roomRef.current) {
    roomRef.current = new Room({
      adaptiveStream:  true,
      dynacast:        true,
      reconnectPolicy: {
        // Retry up to 5 times, backing off exponentially
        maxRetries:   5,
        retryDelay:   (retries) => Math.min(1000 * Math.pow(2, retries), 15000),
      },
      videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    });
  }
  const room = roomRef.current;

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

  /* ── Connect to self-hosted LiveKit ────────────────────── */
  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus('loading');
    setError(null);

    let data;
    try {
      const resp = await api.post(`/live/${streamId}/livekit-token`);
      data = resp.data;
    } catch (apiErr) {
      const serverMsg = apiErr?.response?.data?.error || apiErr?.message || 'API error';
      console.error('[LiveKit] token API error:', serverMsg);
      if (!mountedRef.current) return;
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

    console.log('[LiveKit] connecting to self-hosted:', data.serverUrl, '| room:', data.roomName);

    /* ── Room events ─────────────────────────────────────── */
    room.off(RoomEvent.TrackSubscribed);
    room.off(RoomEvent.TrackUnsubscribed);
    room.off(RoomEvent.AudioPlaybackStatusChanged);
    room.off(RoomEvent.Reconnecting);
    room.off(RoomEvent.Reconnected);
    room.off(RoomEvent.Disconnected);

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        if (track.source === Track.Source.ScreenShare) setRemoteScreenTrack(track);
        else setRemoteVideoTrack(track);
      } else if (track.kind === Track.Kind.Audio) {
        setRemoteAudioTrack(track);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.source === Track.Source.ScreenShare) setRemoteScreenTrack(null);
      else if (track.source === Track.Source.Camera) setRemoteVideoTrack(null);
      else if (track.kind === Track.Kind.Audio) setRemoteAudioTrack(null);
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (mountedRef.current) setAudioLocked(!room.canPlaybackAudio);
    });

    room.on(RoomEvent.Reconnecting, () => {
      if (mountedRef.current) setReconnecting(true);
    });

    room.on(RoomEvent.Reconnected, () => {
      if (mountedRef.current) setReconnecting(false);
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      console.warn('[LiveKit] disconnected:', reason);
      if (mountedRef.current) {
        setReconnecting(false);
        if (reason !== 'CLIENT_INITIATED') {
          setError('انقطع الاتصال بخادم البث');
          setStatus('error');
        }
      }
    });

    room.localParticipant.on(ParticipantEvent.LocalTrackPublished,   () => setLocalVersion(v => v + 1));
    room.localParticipant.on(ParticipantEvent.LocalTrackUnpublished, () => setLocalVersion(v => v + 1));

    /* ── Connect ─────────────────────────────────────────── */
    try {
      await room.connect(data.serverUrl, data.token);
    } catch (connErr) {
      console.error('[LiveKit] connection error:', connErr?.message);
      if (!mountedRef.current) return;
      const msg = connErr?.message || 'unknown';
      setError(
        msg.includes('403') || msg.toLowerCase().includes('token') || msg.includes('401')
          ? 'رمز الدخول غير صالح — تحقق من إعدادات خادم البث'
          : `فشل الاتصال بخادم البث: ${msg}`
      );
      setStatus('error');
      return;
    }

    if (!mountedRef.current) { room.disconnect(); return; }

    // Sync already-present remote tracks (student joins after teacher started)
    room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        if (pub.isSubscribed && pub.track) {
          if (pub.track.kind === Track.Kind.Video) {
            if (pub.track.source === Track.Source.ScreenShare) setRemoteScreenTrack(pub.track);
            else setRemoteVideoTrack(pub.track);
          } else if (pub.track.kind === Track.Kind.Audio) {
            setRemoteAudioTrack(pub.track);
          }
        }
      });
    });

    setStatus('connected');
    setReconnecting(false);

    // Teacher: enable camera + mic
    if (isTeacher) {
      try {
        await room.localParticipant.enableCameraAndMicrophone();
      } catch (mediaErr) {
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
      room.disconnect();
    };
  }, [connect]);

  /* ── Teacher controls ──────────────────────────────────── */
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

  /* ── Student controls (when teacher grants permission) ───── */
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

  // When student loses mic permission, mute locally
  useEffect(() => {
    if (!canSpeak && studentMic) {
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      setStudentMic(false);
    }
  }, [canSpeak, studentMic, room]);

  useEffect(() => {
    if (!canShareScreen && studentScreen) {
      room.localParticipant.setScreenShareEnabled(false).catch(() => {});
      setStudentScreen(false);
    }
  }, [canShareScreen, studentScreen, room]);

  /* ── Determine what to show ────────────────────────────── */
  const hasLocalVideo = (() => {
    if (!isTeacher || status !== 'connected') return false;
    const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    return !!(screenPub?.track || cameraPub?.track);
  })();

  const hasRemoteVideo = !isTeacher && !!(remoteScreenTrack || remoteVideoTrack);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: '#0a0a0a', overflow: 'hidden', ...style,
    }}>
      {status === 'loading' && <LoadingOverlay />}
      {status === 'error'   && (
        <ErrorOverlay
          message={error}
          onRetry={() => { setRetryCount(c => c + 1); connect(); }}
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

          {/* ── Audio unlock button (browser auto-play policy) ── */}
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
              <style>{`@keyframes ctrlPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>

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

          {/* ── Student controls (mic / screen — only when teacher grants permission) ── */}
          {!isTeacher && (canSpeak || canShareScreen) && (
            <div style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 8, zIndex: 20,
              background: 'rgba(0,0,0,0.78)', padding: '8px 12px',
              borderRadius: 14, backdropFilter: 'blur(10px)',
            }}>
              <style>{`@keyframes ctrlPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>
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
