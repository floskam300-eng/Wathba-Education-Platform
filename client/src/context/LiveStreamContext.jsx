import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import api from '../lib/api';

const LiveStreamContext = createContext(null);

export function LiveStreamProvider({ children }) {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;

  // Teacher's active stream (set when teacher starts)
  const [teacherLive, setTeacherLive] = useState(null);

  // Stream the student has joined
  const [studentStream, setStudentStream] = useState(null);

  // Active stream available for student to join (set via SSE or polling)
  const [availableLive, setAvailableLive] = useState(null);

  /* ── Teacher helpers ─────────────────────────────────────── */
  const startTeacherStream = useCallback((data) => setTeacherLive(data), []);
  const endTeacherStream   = useCallback(() => setTeacherLive(null), []);

  /* ── Student helpers ─────────────────────────────────────── */
  const joinStudentStream  = useCallback((stream) => {
    setStudentStream(stream);
    setAvailableLive(null);
  }, []);

  const leaveStudentStream = useCallback(async (streamId) => {
    if (streamId) {
      try { await api.post(`/live/${streamId}/leave`); } catch (err) {
        console.warn('[LiveStream] leave failed:', err?.message);
      }
    }
    setStudentStream(null);
  }, []);

  const clearAvailableLive = useCallback(() => setAvailableLive(null), []);

  /* ── Student: poll for available live streams on mount ──── */
  useEffect(() => {
    if (!user || user.role !== 'student') return;

    const checkAvailable = async () => {
      try {
        const r = await api.get('/live/available');
        const streams = r.data.streams || [];
        if (streams.length > 0) setAvailableLive(streams[0]);
        else setAvailableLive(null);
      } catch (err) {
        console.warn('[LiveStream] checkAvailable failed:', err?.message);
      }
    };

    checkAvailable();
    const iv = setInterval(checkAvailable, 30000);
    return () => clearInterval(iv);
  }, [user?.id, user?.role]);

  /* ── Listen to window events dispatched by SSE hook ──────── */
  useEffect(() => {
    if (!user) return;

    const onLiveStarted = (e) => {
      if (user.role === 'student') setAvailableLive(e.detail);
    };

    const onLiveEnded = (e) => {
      if (user.role === 'student') {
        setAvailableLive(prev =>
          prev && String(prev.streamId) === String(e.detail?.streamId) ? null : prev
        );
        setStudentStream(prev =>
          prev && String(prev.id) === String(e.detail?.streamId) ? null : prev
        );
      }
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
