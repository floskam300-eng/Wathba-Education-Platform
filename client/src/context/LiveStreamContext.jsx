import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import api from '../lib/api';

const LiveStreamContext = createContext(null);

export function LiveStreamProvider({ children }) {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;

  const [teacherLive,   setTeacherLive]   = useState(null);
  const [studentStream, setStudentStream] = useState(null);
  const [availableLive, setAvailableLive] = useState(null);

  /* ── Teacher helpers ─────────────────────────────────────── */
  const startTeacherStream = useCallback((data) => setTeacherLive(data), []);
  const endTeacherStream   = useCallback(() => setTeacherLive(null), []);

  /* ── Student helpers ─────────────────────────────────────── */
  const joinStudentStream = useCallback((stream) => {
    setStudentStream(stream);
    setAvailableLive(null);
  }, []);

  const leaveStudentStream = useCallback(() => {
    setStudentStream(null);
  }, []);

  const clearAvailableLive = useCallback(() => setAvailableLive(null), []);

  /* ── Student: poll for available live streams ──────────────
     Interval reduced to 30s — SSE delivers live_started instantly,
     polling is only a safety net for missed events.
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || user.role !== 'student') return;

    const checkAvailable = async () => {
      try {
        const r = await api.get('/live/available');
        const streams = r.data.streams || [];
        const active = streams.find(s => s.status === 'active') || streams[0] || null;
        setAvailableLive(active);
      } catch (err) {
        console.warn('[LiveStream] checkAvailable failed:', err?.message);
      }
    };

    checkAvailable();
    const iv = setInterval(checkAvailable, 30_000);
    return () => clearInterval(iv);
  }, [user?.id, user?.role]);

  /* ── Listen to SSE events dispatched as window events ───────
     FIX: live_started SSE payload shape is
       { streamId, title, teacherName, roomId }
     but stream objects (from /available) have `id` field.
     We normalise the SSE payload to a minimal stream object
     with `id` so downstream consumers work uniformly.
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;

    const onLiveStarted = (e) => {
      if (user.role !== 'student') return;
      const p = e.detail || {};
      /* Normalise SSE payload → stream-shaped object */
      setAvailableLive({
        id:           p.streamId,
        title:        p.title        || '',
        teacher_name: p.teacherName  || '',
        room_id:      p.roomId       || '',
        status:       'active',
        started_at:   new Date().toISOString(),
      });
    };

    const onLiveEnded = (e) => {
      if (user.role !== 'student') return;
      const endedId = String(e.detail?.streamId);
      setAvailableLive(prev =>
        prev && String(prev.id) === endedId ? null : prev
      );
      setStudentStream(prev =>
        prev && String(prev.id) === endedId ? null : prev
      );
    };

    window.addEventListener('wathba_live_started', onLiveStarted);
    window.addEventListener('wathba_live_ended',   onLiveEnded);
    return () => {
      window.removeEventListener('wathba_live_started', onLiveStarted);
      window.removeEventListener('wathba_live_ended',   onLiveEnded);
    };
  }, [user?.id, user?.role]);

  return (
    <LiveStreamContext.Provider value={{
      teacherLive,  startTeacherStream, endTeacherStream,
      studentStream, joinStudentStream, leaveStudentStream,
      availableLive, clearAvailableLive,
    }}>
      {children}
    </LiveStreamContext.Provider>
  );
}

export const useLiveStream = () => useContext(LiveStreamContext);
