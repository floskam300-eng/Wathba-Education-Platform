import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Play, FileText, BookOpen, Video, Clock,
  CheckCircle2, Lock, ChevronRight, ChevronLeft, AlertCircle,
  Pause, Volume2, VolumeX, Maximize2, Minimize2, RotateCcw, RotateCw,
  Settings, Gauge, CheckCircle, XCircle, RefreshCw, Trophy, Eye, ZoomIn
} from 'lucide-react';
import SecurePdfViewer from '../../components/SecurePdfViewer';
import ImageLightbox from '../../components/ImageLightbox';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { withToken } from '../../lib/mediaAccess';
import QuestionImage from '../../components/ui/QuestionImage';
import { toUTCDate, getServerNowMs } from '../../lib/dateUtils';

/* ─── helpers ─────────────────────────────────────────── */
const fmt = (min) => min >= 60
  ? `${Math.floor(min / 60)}س ${min % 60}د`
  : `${min} دقيقة`;

// A student is "passed" if they ever passed (stable once earned),
// regardless of whether a later retry attempt failed.
const isRecPassed = (rec) => rec.my_ever_passed ?? rec.my_passed ?? false;

// Compute the per-video lock progress: which recitations lock this video,
// and how many have been passed. Returns null when the video is unlocked.
function computeLockProgress(video, courseRecitations) {
  if (!video || video.is_locked === false) return null;
  const linkedRecs = courseRecitations.filter(r =>
    Array.isArray(r.video_ids) && r.video_ids.map(Number).includes(video.id)
  );
  if (linkedRecs.length === 0) return null;
  const passed = linkedRecs.filter(r => isRecPassed(r)).length;
  return { linkedRecs, passed, total: linkedRecs.length };
}

/* ─── Player settings persistence (localStorage) ─────── */
const STORAGE_VOLUME   = 'wathba_player_volume';
const STORAGE_MUTED    = 'wathba_player_muted';
const STORAGE_SPEED    = 'wathba_player_speed';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const loadVolume  = () => { try { const v = localStorage.getItem(STORAGE_VOLUME); return v !== null ? parseFloat(v) : 80; } catch { return 80; } };
const loadMuted   = () => { try { return localStorage.getItem(STORAGE_MUTED) === 'true'; } catch { return false; } };
const loadSpeed   = () => { try { const s = localStorage.getItem(STORAGE_SPEED);  return s !== null ? parseFloat(s) : 1;  } catch { return 1;  } };
const saveVolume  = (v) => { try { localStorage.setItem(STORAGE_VOLUME, String(v)); } catch {} };
const saveMuted   = (m) => { try { localStorage.setItem(STORAGE_MUTED,  String(m)); } catch {} };
const saveSpeed   = (s) => { try { localStorage.setItem(STORAGE_SPEED,  String(s)); } catch {} };
// Scope the video position key by the logged-in user's ID so that multiple
// students sharing the same browser don't overwrite each other's position.
const _vidUserId = () => { try { return JSON.parse(localStorage.getItem('wathba_user') || '{}').id || ''; } catch { return ''; } };
const saveVidPos  = (id, pos) => { try { if (pos > 5) localStorage.setItem(`wathba_vid_pos_${_vidUserId()}_${id}`, String(Math.round(pos))); } catch {} };
const loadVidPos  = (id) => { try { return parseInt(localStorage.getItem(`wathba_vid_pos_${_vidUserId()}_${id}`) || '0', 10); } catch { return 0; } };

/* ─── Device-orientation aware "force landscape" helper ──────────
   The rotate button fakes a landscape presentation (via CSS rotate) for
   phones that are held in portrait. If the phone is *already* physically
   in landscape, applying that same 90° rotate makes the video appear
   sideways instead of fixing anything — so we track real device
   orientation and only rotate when the device itself is still portrait. */
const getDeviceIsLandscape = () => {
  try { return window.matchMedia('(orientation: landscape)').matches; } catch { return false; }
};

function useDeviceOrientation() {
  const [isLandscape, setIsLandscape] = useState(getDeviceIsLandscape);
  useEffect(() => {
    let mq;
    const onChange = () => setIsLandscape(getDeviceIsLandscape());
    try {
      mq = window.matchMedia('(orientation: landscape)');
      mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    } catch (_) {}
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      try { mq && (mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange)); } catch (_) {}
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);
  return isLandscape;
}

/* ─── Floating Watermark ───────────────────────────────── */
const WATERMARK_SLOTS = [
  { x: 5,  y: 8  },
  { x: 55, y: 12 },
  { x: 25, y: 55 },
  { x: 68, y: 48 },
  { x: 10, y: 75 },
  { x: 48, y: 30 },
];

function WatermarkBadge({ name, code, slotIndex }) {
  const [posIdx, setPosIdx] = useState(slotIndex % WATERMARK_SLOTS.length);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = (slotIndex + 1) * 5000;
    // Track the inner timeout so it can be cancelled if the component unmounts
    // during the 700 ms fade-out window (prevents setState on unmounted component).
    let fadeTimeoutId = null;
    const id = setInterval(() => {
      setVisible(false);
      fadeTimeoutId = setTimeout(() => {
        fadeTimeoutId = null;
        setPosIdx(prev => {
          let next;
          do { next = Math.floor(Math.random() * WATERMARK_SLOTS.length); } while (next === prev);
          return next;
        });
        setVisible(true);
      }, 700);
    }, interval);
    return () => {
      clearInterval(id);
      if (fadeTimeoutId !== null) clearTimeout(fadeTimeoutId);
    };
  }, [slotIndex]);

  const pos = WATERMARK_SLOTS[posIdx];

  return (
    <div
      style={{
        position: 'absolute',
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transition: 'opacity 0.7s ease',
        opacity: visible ? 0.22 : 0,
        pointerEvents: 'none',
        zIndex: 20,
        userSelect: 'none',
        direction: 'rtl',
      }}
    >
      <div style={{
        background: 'rgba(0,0,0,0.5)',
        borderRadius: '8px',
        padding: '4px 10px',
        backdropFilter: 'blur(2px)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}>
        {name && (
          <p style={{ color: '#fff', fontSize: '12px', fontWeight: 700, margin: 0, lineHeight: 1.4, textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
            {name}
          </p>
        )}
        {code && (
          <p style={{ color: '#ffa94d', fontSize: '10px', fontWeight: 800, margin: 0, lineHeight: 1.3, fontFamily: 'monospace', letterSpacing: '0.08em', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            {code}
          </p>
        )}
      </div>
    </div>
  );
}

function FloatingWatermark({ name, code }) {
  if (!name && !code) return null;
  return (
    <>
      {[0, 1].map(i => (
        <WatermarkBadge key={i} name={name} code={code} slotIndex={i} />
      ))}
    </>
  );
}

/* ─── YouTube URL helpers ──────────────────────────────── */
function extractYoutubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function isYoutubeUrl(url) {
  return !!extractYoutubeId(url);
}

/* ─── YouTube IFrame API global loader ─────────────────── */
let _ytApiReady = false;
const _ytApiQueue = [];
function ensureYTApi(cb) {
  if (window.YT && window.YT.Player) {
    _ytApiReady = true;
    cb();
    return;
  }
  _ytApiQueue.push(cb);
  if (!document.getElementById('yt-api-script')) {
    const s = document.createElement('script');
    s.id = 'yt-api-script';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
  const prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (prevReady) {
      try { prevReady(); } catch (_) {}
    }
    _ytApiReady = true;
    while (_ytApiQueue.length > 0) {
      const fn = _ytApiQueue.shift();
      try { fn(); } catch (_) {}
    }
  };
}

/* ─── Custom YouTube Player (IFrame API) ───────────────── */
function YoutubePlayer({ video, onProgressUpdate, studentName, studentCode, initialPosition = 0 }) {
  const containerRef  = useRef(null);
  const playerRef     = useRef(null);
  const playerDivId   = useRef(`yt-${Math.random().toString(36).slice(2)}`).current;
  const saveTimer     = useRef(null);
  const progressTimer = useRef(null);
  const hideTimer     = useRef(null);
  const seeking       = useRef(false);
  const maxPct        = useRef(0);
  const actualWatched = useRef(0);
  const playStart     = useRef(null);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const videoIdRef          = useRef(video?.id);
  const initialPositionRef  = useRef(initialPosition);

  const [playing,      setPlaying]      = useState(false);
  const [buffering,    setBuffering]    = useState(false);
  const [ytError,      setYtError]      = useState(null);
  const [progress,     setProgress]     = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [volume,       setVolume]       = useState(() => loadVolume());
  const [muted,        setMuted]        = useState(() => loadMuted());
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [cssLandscape, setCssLandscape] = useState(false);
  const [speed,        setSpeed]        = useState(() => loadSpeed());
  const [showSpeed,    setShowSpeed]    = useState(false);

  // Resolve the YouTube id: prefer the server-provided youtube_id (which hides the
  // raw URL from the API response); fall back to extracting it from file_path_or_url
  // for teacher preview / backwards compatibility.
  const ytId = video?.youtube_id || extractYoutubeId(video?.file_path_or_url);

  /* ── keep prop refs current ── */
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
  useEffect(() => { videoIdRef.current = video?.id; }, [video?.id]);
  useEffect(() => { initialPositionRef.current = initialPosition; }, [initialPosition]);

  /* ── flush helper (safe to call from cleanup) ── */
  const flushYTProgress = () => {
    if (!onProgressUpdateRef.current || !videoIdRef.current) return;
    if (playStart.current) {
      actualWatched.current += Math.round((Date.now() - playStart.current) / 1000);
      playStart.current = null;
    }
    try {
      const ct = playerRef.current?.getCurrentTime?.() || 0;
      const d  = playerRef.current?.getDuration?.() || 0;
      const watchedMin = d > 0 ? (maxPct.current / 100) * (d / 60) : 0;
      saveVidPos(videoIdRef.current, ct);
      onProgressUpdateRef.current(videoIdRef.current, watchedMin, maxPct.current, false, ct, actualWatched.current);
    } catch (_) {}
  };

  /* ── reset state on video change (save previous first) ── */
  useEffect(() => {
    maxPct.current = 0;
    actualWatched.current = 0;
    playStart.current = null;
    setBuffering(false);
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }, [ytId]);

  /* ── fullscreen change listener ── */
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        setCssFullscreen(false);
        try { screen.orientation?.unlock?.(); } catch (_) {}
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  /* ── initialise / destroy player ── */
  useEffect(() => {
    if (!ytId) return;

    setYtError(null);
    const startPos = initialPositionRef.current > 5 ? Math.floor(initialPositionRef.current) : 0;
    const savedVol   = loadVolume();
    const savedSpeed = loadSpeed();

    const init = () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }
      playerRef.current = new window.YT.Player(playerDivId, {
        height: '100%',
        width: '100%',
        videoId: ytId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          cc_load_policy: 0,
          enablejsapi: 1,
          origin: window.location.origin,
          start: startPos,
        },
        events: {
          onReady: (e) => {
            setBuffering(false);
            const d = e.target.getDuration();
            if (d > 0) setDuration(d);
            // Apply pointer-events:none to the actual iframe so clicks don't leak to YouTube native controls
            try {
              const iframe = e.target.getIframe();
              if (iframe) {
                iframe.style.pointerEvents = 'none';
              }
            } catch (_) {}
            // Player started muted (mute:1 in playerVars) so autoplay works on mobile.
            // Restore user's preferred volume state.
            try {
              if (loadMuted()) {
                e.target.mute();
              } else {
                e.target.unMute();
                e.target.setVolume(savedVol);
              }
            } catch (_) {}
            try { e.target.setPlaybackRate(savedSpeed); } catch (_) {}
            if (startPos > 0) {
              try { e.target.seekTo(startPos, true); } catch (_) {}
            }
          },
          onStateChange: (e) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) {
              setPlaying(true);
              setBuffering(false);
              playStart.current = Date.now();
              const d = e.target.getDuration();
              if (d > 0) setDuration(d);
              try { e.target.setPlaybackRate(loadSpeed()); } catch (_) {}
              clearInterval(progressTimer.current);
              progressTimer.current = setInterval(() => {
                if (seeking.current || !playerRef.current) return;
                try {
                  const ct = playerRef.current.getCurrentTime();
                  const dur = playerRef.current.getDuration();
                  setCurrentTime(ct);
                  if (dur > 0) {
                    const pct = (ct / dur) * 100;
                    setProgress(pct);
                    if (pct > maxPct.current) maxPct.current = pct;
                  }
                } catch (_) {}
              }, 500);
              clearInterval(saveTimer.current);
              saveTimer.current = setInterval(() => {
                if (!playerRef.current || !onProgressUpdateRef.current || !videoIdRef.current) return;
                try {
                  const dur = playerRef.current.getDuration() || 0;
                  const ct  = playerRef.current.getCurrentTime() || 0;
                  const watchedMin = dur > 0 ? (maxPct.current / 100) * (dur / 60) : 0;
                  saveVidPos(videoIdRef.current, ct);
                  const intervalSec = playStart.current ? Math.round((Date.now() - playStart.current) / 1000) : 0;
                  playStart.current = Date.now();
                  onProgressUpdateRef.current(videoIdRef.current, watchedMin, maxPct.current, false, ct, intervalSec);
                } catch (_) {}
              }, 10000);
            } else if (e.data === S.BUFFERING) {
              setBuffering(true);
            } else if (e.data === -1 || e.data === 5) {
              setBuffering(false);
              setPlaying(false);
            } else {
              setPlaying(false);
              setBuffering(false);
              clearInterval(progressTimer.current);
              clearInterval(saveTimer.current);
              if (playStart.current) {
                actualWatched.current += Math.round((Date.now() - playStart.current) / 1000);
                playStart.current = null;
              }
              if (e.data === S.ENDED && onProgressUpdateRef.current && videoIdRef.current) {
                const dur = playerRef.current?.getDuration?.() || 0;
                setProgress(100);
                saveVidPos(videoIdRef.current, dur);
                onProgressUpdateRef.current(videoIdRef.current, dur / 60, 100, true, dur, actualWatched.current);
              } else if (onProgressUpdateRef.current && videoIdRef.current) {
                try {
                  const dur = playerRef.current?.getDuration?.() || 0;
                  const ct  = playerRef.current?.getCurrentTime?.() || 0;
                  const watchedMin = dur > 0 ? (maxPct.current / 100) * (dur / 60) : 0;
                  saveVidPos(videoIdRef.current, ct);
                  onProgressUpdateRef.current(videoIdRef.current, watchedMin, maxPct.current, false, ct, actualWatched.current);
                } catch (_) {}
              }
            }
          },
          onError: (e) => {
            // YouTube error codes: 2=bad videoId, 5=HTML5 error,
            // 100=not found/private, 101/150=embedding disabled by owner.
            setBuffering(false);
            setPlaying(false);
            const msg = (e.data === 150 || e.data === 101)
              ? 'هذا الفيديو لا يسمح بتضمينه خارج YouTube — تواصل مع المعلم لتحديث الرابط.'
              : 'حدث خطأ أثناء تحميل الفيديو. حاول مرة أخرى أو تواصل مع المعلم.';
            setYtError(msg);
          },
        },
      });
    };

    ensureYTApi(init);

    return () => {
      clearInterval(progressTimer.current);
      clearInterval(saveTimer.current);
      clearTimeout(hideTimer.current);
      flushYTProgress();
      try { playerRef.current?.stopVideo(); } catch (_) {}
      try { playerRef.current?.destroy(); playerRef.current = null; } catch (_) {}
    };
  }, [ytId]); // eslint-disable-line

  /* ── controls helpers ── */
  const toggle = () => {
    if (!playerRef.current) return;
    try {
      const d = playerRef.current.getDuration?.() || 0;
      const ct = playerRef.current.getCurrentTime?.() || 0;
      // If video is at or near the end, restart from beginning
      if (d > 0 && ct >= d - 2) {
        playerRef.current.seekTo(0, true);
        setCurrentTime(0);
        setProgress(0);
        playerRef.current.playVideo();
        return;
      }
      if (playing) {
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    } catch (_) {}
  };

  const onSeekChange = (e) => {
    const pct = Number(e.target.value);
    setProgress(pct);
    try {
      const d = playerRef.current?.getDuration() || 0;
      const t = (pct / 100) * d;
      playerRef.current?.seekTo(t, true);
      setCurrentTime(t);
    } catch (_) {}
  };

  const onVolumeChange = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    saveVolume(v);
    saveMuted(v === 0);
    try {
      playerRef.current?.setVolume(v);
      v === 0 ? playerRef.current?.mute() : playerRef.current?.unMute();
    } catch (_) {}
  };

  const toggleMute = () => {
    try {
      if (muted) { playerRef.current?.unMute(); setMuted(false); saveMuted(false); }
      else        { playerRef.current?.mute();   setMuted(true);  saveMuted(true);  }
    } catch (_) {}
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    saveSpeed(s);
    setShowSpeed(false);
    try { playerRef.current?.setPlaybackRate(s); } catch (_) {}
  };

  const deviceIsLandscape = useDeviceOrientation();

  const toggleLandscape = async () => {
    const el = containerRef.current;
    if (!el) return;
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement || isFullscreen || cssFullscreen);
    if (!inFs) {
      const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (fsReq) {
        try {
          await fsReq.call(el);
          setIsFullscreen(true);
          try { await screen.orientation?.lock?.('landscape'); } catch (_) {}
        } catch (_) {
          setCssFullscreen(true);
          setIsFullscreen(true);
        }
      } else {
        setCssFullscreen(true);
        setIsFullscreen(true);
      }
    } else {
      try {
        if (deviceIsLandscape) {
          screen.orientation?.unlock?.();
        } else {
          screen.orientation?.lock?.('landscape').catch(() => {});
        }
      } catch (_) {}
    }
  };

  const toggleFullscreen = () => {
    const inNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (inNativeFs || cssFullscreen) {
      if (inNativeFs) {
        try { (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document); } catch (_) {}
      }
      try { screen.orientation?.unlock?.(); } catch (_) {}
      setCssFullscreen(false);
      setIsFullscreen(false);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fsReq) {
      fsReq.call(el)
        .then(() => {
          setIsFullscreen(true);
        })
        .catch(() => {
          setCssFullscreen(true);
          setIsFullscreen(true);
        });
    } else {
      setCssFullscreen(true);
      setIsFullscreen(true);
    }
  };

  const resetHide = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!seeking.current && playing) setShowControls(false);
    }, 3000);
  };

  const handleScreenTap = (e) => {
    e.stopPropagation();
    if (showControls) {
      clearTimeout(hideTimer.current);
      setShowControls(false);
    } else {
      resetHide();
    }
  };

  const fmtSec = (s) => {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const pctStr = `${progress}%`;
  const volStr = `${muted ? 0 : volume}%`;

  const inFs = isFullscreen || cssFullscreen;
  const fsStyle = inFs
    ? { position: 'fixed', inset: 0, zIndex: 9999, width: '100vw', height: '100vh' }
    : {};

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none overflow-hidden"
      style={fsStyle}
      onMouseMove={resetHide}
      onMouseLeave={() => { if (!seeking.current && playing) setShowControls(false); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <FloatingWatermark name={studentName} code={studentCode} />

      {/* ── YouTube iframe wrapper — adapts in fullscreen to preserve full video frame ── */}
      <div
        className="absolute transition-all duration-300"
        style={
          inFs
            ? { top: -20, left: 0, right: 0, bottom: -35, transform: 'scale(0.96)', transformOrigin: 'center center' }
            : { top: -55, left: 0, right: 0, bottom: -85 }
        }
      >
        <div id={playerDivId} className="w-full h-full" />
      </div>

      {/* ── YouTube UI gradient masks — fade out while playing so 100% of video content is visible ── */}
      <div
        className={`absolute top-0 left-0 right-0 pointer-events-none transition-opacity duration-300 ${
          showControls || !playing ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ height: inFs ? 60 : 75, background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)', zIndex: 9 }}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-300 ${
          showControls || !playing ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ height: inFs ? 60 : 75, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)', zIndex: 9 }}
      />

      {/* Click interceptor — captures taps to toggle controls */}
      <div className="absolute inset-0" style={{ zIndex: 10 }} onClick={handleScreenTap} onContextMenu={(e) => e.preventDefault()} />

      {/* Centered play/pause overlay — shows on hover (showControls) or when not playing */}
      {!ytError && (showControls || !playing) && (
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ zIndex: 20, pointerEvents: 'none' }}
        >
          <div
            className="w-20 h-20 rounded-full bg-black/50 border-2 border-white/40 flex items-center justify-center shadow-2xl hover:bg-orange-500 hover:border-orange-400 hover:scale-110 transition-all cursor-pointer backdrop-blur-md"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            {playing
              ? <Pause className="w-8 h-8 text-white fill-white" />
              : <Play  className="w-8 h-8 text-white fill-white mr-[-2px]" />
            }
          </div>
        </div>
      )}

      {/* Buffering spinner while playing and buffering */}
      {buffering && playing && !ytError && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20, pointerEvents: 'none' }}>
          <div className="w-12 h-12 border-4 border-white/20 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {/* YouTube error message */}
      {ytError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80" style={{ zIndex: 20, pointerEvents: 'none' }}>
          <div className="text-center px-6 max-w-sm">
            <div className="text-red-400 text-4xl mb-3">⚠️</div>
            <p className="text-white text-sm leading-relaxed">{ytError}</p>
          </div>
        </div>
      )}

      {/* Speed picker popup */}
      {showSpeed && (
        <div className="absolute bottom-20 left-4 bg-gray-900/95 border border-white/10 rounded-xl overflow-hidden shadow-2xl" style={{ zIndex: 40 }}>
          <p className="text-[10px] font-bold text-gray-400 px-3 pt-2 pb-1 border-b border-white/10">سرعة التشغيل</p>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => changeSpeed(s)}
              className={`w-full text-center px-5 py-1.5 text-sm font-bold transition-colors ${speed === s ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
              {s === 1 ? 'عادي' : `${s}x`}
            </button>
          ))}
        </div>
      )}

      {/* Bottom control bar — minimal, gradient, auto-hides while playing */}
      <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ zIndex: 30 }}>
        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 sm:px-4 pt-8 pb-2">
          <div className="mb-2">
            <input type="range" min="0" max="100" step="0.1" value={progress} dir="ltr"
              className="player-range player-range-progress" style={{ '--pct': pctStr }}
              onMouseDown={() => { seeking.current = true; }}
              onMouseUp={() => { seeking.current = false; resetHide(); }}
              onTouchStart={() => { seeking.current = true; resetHide(); }}
              onTouchEnd={() => { seeking.current = false; resetHide(); }}
              onChange={onSeekChange} />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={toggle} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            </button>
            <span className="text-white/70 text-xs font-mono flex-shrink-0">{fmtSec(currentTime)} / {fmtSec(duration)}</span>
            <div className="flex-1" />
            <button onClick={() => setShowSpeed(p => !p)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold transition-colors flex-shrink-0 ${speed !== 1 ? 'text-orange-400 bg-orange-400/10' : 'text-white/70 hover:text-white'}`}>
              <Gauge className="w-3.5 h-3.5" />
              {speed === 1 ? '1x' : `${speed}x`}
            </button>
            <button onClick={toggleMute} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className="w-16 sm:w-20 flex-shrink-0 hidden sm:block">
              <input type="range" min="0" max="100" step="1" value={muted ? 0 : volume} dir="ltr"
                className="player-range player-range-volume" style={{ '--vol': volStr }}
                onChange={onVolumeChange} />
            </div>
            {/* زر تدوير الشاشة — يظهر على الموبايل فقط */}
            <button
              onClick={toggleLandscape}
              className={`sm:hidden transition-colors flex-shrink-0 ${inFs && deviceIsLandscape ? 'text-orange-400' : 'text-white hover:text-orange-400'}`}
              title="تدوير الشاشة"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {inFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Custom Video Player ──────────────────────────────── */
function VideoPlayer({ video, onProgressUpdate, studentName, studentCode, initialPosition = 0 }) {
  const containerRef  = useRef(null);
  const videoRef      = useRef(null);
  const hideTimer     = useRef(null);
  const seeking       = useRef(false);
  const saveTimer     = useRef(null);
  const actualWatched = useRef(0);
  const playStart     = useRef(null);
  const maxProgress   = useRef(0);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const videoIdRef          = useRef(video?.id);

  const [playing,      setPlaying]      = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [volume,       setVolume]       = useState(() => loadVolume() / 100);
  const [muted,        setMuted]        = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [cssLandscape, setCssLandscape] = useState(false);
  const [speed,        setSpeed]        = useState(() => loadSpeed());
  const [showSpeed,    setShowSpeed]    = useState(false);
  const pendingSeekRef = useRef(null);

  /* ── keep prop refs current ── */
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
  useEffect(() => { videoIdRef.current = video?.id; }, [video?.id]);

  /* ── flush helper: save progress safely (refs only, no stale closures) ── */
  const flushProgress = () => {
    if (!onProgressUpdateRef.current || !videoIdRef.current || !videoRef.current) return;
    if (playStart.current) {
      actualWatched.current += Math.round((Date.now() - playStart.current) / 1000);
      playStart.current = null;
    }
    const d  = videoRef.current.duration || 0;
    const ct = videoRef.current.currentTime || 0;
    const watchedMin = d > 0 ? (maxProgress.current / 100) * (d / 60) : 0;
    saveVidPos(videoIdRef.current, ct);
    onProgressUpdateRef.current(videoIdRef.current, watchedMin, maxProgress.current, false, ct, actualWatched.current);
  };

  /* ── save previous video's progress before switching ── */
  useEffect(() => {
    return () => { flushProgress(); };
  }, [video?.id]); // eslint-disable-line

  /* ── unmount: stop video and save progress ── */
  useEffect(() => {
    return () => {
      clearInterval(saveTimer.current);
      try { videoRef.current?.pause(); } catch (_) {}
      flushProgress();
    };
  }, []); // eslint-disable-line

  /* ── flush progress when tab/window is closed ── */
  useEffect(() => {
    const handleBeforeUnload = () => { flushProgress(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []); // eslint-disable-line

  /* ── reset state when video changes ── */
  useEffect(() => {
    clearInterval(saveTimer.current);
    saveTimer.current = null;
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    maxProgress.current  = 0;
    actualWatched.current = 0;
    playStart.current    = null;
  }, [video?.id]);

  /* ── fullscreen change listener ── */
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        setCssFullscreen(false);
        try { screen.orientation?.unlock?.(); } catch (_) {}
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange', onFsChange);
    };
  }, []);

  const resetHideTimer = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!seeking.current) setShowControls(false); }, 3000);
  };

  const handleScreenTap = (e) => {
    e.stopPropagation();
    if (showControls) {
      clearTimeout(hideTimer.current);
      setShowControls(false);
    } else {
      resetHideTimer();
    }
  };

  const toggle = () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.ended || (duration > 0 && videoRef.current.currentTime >= duration - 2)) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
        return;
      }
      if (playing) videoRef.current.pause();
      else         videoRef.current.play();
    } catch (_) {}
  };

  const fmtSec = (s) => {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const onSeekChange = (e) => {
    const pct = Number(e.target.value);
    setProgress(pct);
    if (videoRef.current && duration)
      videoRef.current.currentTime = (pct / 100) * duration;
  };

  const onVolumeChange = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    saveVolume(Math.round(v * 100));
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    saveSpeed(s);
    setShowSpeed(false);
    if (videoRef.current) videoRef.current.playbackRate = s;
  };

  const deviceIsLandscape = useDeviceOrientation();

  const toggleLandscape = async () => {
    const el = containerRef.current;
    if (!el) return;
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement || isFullscreen || cssFullscreen);
    if (!inFs) {
      const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (fsReq) {
        try {
          await fsReq.call(el);
          setIsFullscreen(true);
          try { await screen.orientation?.lock?.('landscape'); } catch (_) {}
        } catch (_) {
          if (videoRef.current?.webkitEnterFullscreen) {
            videoRef.current.webkitEnterFullscreen();
          } else {
            setCssFullscreen(true);
            setIsFullscreen(true);
          }
        }
      } else if (videoRef.current?.webkitEnterFullscreen) {
        videoRef.current.webkitEnterFullscreen();
      } else {
        setCssFullscreen(true);
        setIsFullscreen(true);
      }
    } else {
      try {
        if (deviceIsLandscape) {
          screen.orientation?.unlock?.();
        } else {
          screen.orientation?.lock?.('landscape').catch(() => {});
        }
      } catch (_) {}
    }
  };

  const toggleFullscreen = () => {
    const inNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (inNativeFs || cssFullscreen) {
      if (inNativeFs) {
        try { (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document); } catch (_) {}
      }
      try { screen.orientation?.unlock?.(); } catch (_) {}
      setCssFullscreen(false);
      setIsFullscreen(false);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fsReq) {
      fsReq.call(el)
        .then(() => {
          setIsFullscreen(true);
        })
        .catch(() => {
          if (videoRef.current?.webkitEnterFullscreen) {
            videoRef.current.webkitEnterFullscreen();
          } else {
            setCssFullscreen(true);
            setIsFullscreen(true);
          }
        });
    } else if (videoRef.current?.webkitEnterFullscreen) {
      videoRef.current.webkitEnterFullscreen();
    } else {
      setCssFullscreen(true);
      setIsFullscreen(true);
    }
  };

  if (!video) return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-center text-gray-500">
        <Video className="w-20 h-20 mx-auto mb-4 opacity-20" />
        <p className="text-gray-400 font-semibold text-lg">اختر محاضرة للمشاهدة</p>
      </div>
    </div>
  );

  // A video is a YouTube video if it carries a youtube_id (student API hides the
  // raw URL) OR its raw file_path_or_url looks like a YouTube link (teacher preview).
  if (video.youtube_id || isYoutubeUrl(video.file_path_or_url)) {
    return <YoutubePlayer video={video} onProgressUpdate={onProgressUpdate} studentName={studentName} studentCode={studentCode} initialPosition={initialPosition} />;
  }

  const currentSrc = video.file_path_or_url;

  const pct = `${progress}%`;
  const vol = `${(muted ? 0 : volume) * 100}%`;

  const inVFs = isFullscreen || cssFullscreen;
  const vFsStyle = inVFs
    ? { position: 'fixed', inset: 0, zIndex: 9999, width: '100vw', height: '100vh' }
    : {};

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black"
      style={vFsStyle}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (!seeking.current && playing) setShowControls(false); }}
      onTouchStart={resetHideTimer}
    >
      <FloatingWatermark name={studentName} code={studentCode} />

      <video
        ref={videoRef}
        key={video.id}
        src={withToken(currentSrc)}
        className="w-full h-full object-contain cursor-pointer"
        muted={muted}
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
        onTimeUpdate={() => {
          if (!videoRef.current || seeking.current) return;
          const ct = videoRef.current.currentTime;
          const d  = duration || 1;
          setCurrentTime(ct);
          const p = ct / d * 100;
          setProgress(p);
          if (p > maxProgress.current) maxProgress.current = p;
        }}
        onLoadedMetadata={() => {
          const d = videoRef.current?.duration || 0;
          setDuration(d);
          if (videoRef.current) {
            videoRef.current.volume       = loadVolume() / 100;
            videoRef.current.playbackRate = loadSpeed();
            if (pendingSeekRef.current) {
              const { time, play } = pendingSeekRef.current;
              pendingSeekRef.current = null;
              videoRef.current.currentTime = time;
              if (play) videoRef.current.play();
            } else if (initialPosition > 5) {
              videoRef.current.currentTime = initialPosition;
            }
          }
        }}
        onEnded={() => {
          setPlaying(false);
          clearInterval(saveTimer.current);
          if (playStart.current) { actualWatched.current += Math.round((Date.now() - playStart.current) / 1000); playStart.current = null; }
          if (onProgressUpdate && video?.id) {
            const d = videoRef.current?.duration || 0;
            saveVidPos(video.id, d);
            onProgressUpdate(video.id, d / 60, 100, true, d, actualWatched.current);
          }
        }}
        onPlay={() => {
          setPlaying(true);
          playStart.current = Date.now();
          if (videoRef.current) videoRef.current.playbackRate = loadSpeed();
          clearInterval(saveTimer.current);
          saveTimer.current = setInterval(() => {
            if (!videoRef.current) return;
            const d   = videoRef.current.duration || 0;
            const ct  = videoRef.current.currentTime || 0;
            const watchedMin = d > 0 ? (maxProgress.current / 100) * (d / 60) : 0;
            const elapsed = playStart.current ? Math.round((Date.now() - playStart.current) / 1000) : 0;
            actualWatched.current += elapsed;
            playStart.current = Date.now();
            saveVidPos(video.id, ct);
            if (onProgressUpdate && video?.id) onProgressUpdate(video.id, watchedMin, maxProgress.current, false, ct, actualWatched.current);
          }, 10000);
        }}
        onPause={() => {
          setPlaying(false);
          clearInterval(saveTimer.current);
          if (playStart.current) { actualWatched.current += Math.round((Date.now() - playStart.current) / 1000); playStart.current = null; }
          if (onProgressUpdate && video?.id && videoRef.current) {
            const d  = videoRef.current.duration || 0;
            const ct = videoRef.current.currentTime || 0;
            const watchedMin = d > 0 ? (maxProgress.current / 100) * (d / 60) : 0;
            saveVidPos(video.id, ct);
            onProgressUpdate(video.id, watchedMin, maxProgress.current, false, ct, actualWatched.current);
          }
        }}
        onClick={handleScreenTap}
      />

      {/* Centered play/pause overlay — shows on hover (showControls) or when paused */}
      {(showControls || !playing) && (
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}
          style={{ pointerEvents: 'none', zIndex: 15 }}
        >
          <div
            className="w-20 h-20 rounded-full bg-black/40 border-2 border-white/30 flex items-center justify-center shadow-2xl hover:bg-orange-500/80 hover:border-orange-400/50 hover:scale-110 transition-all cursor-pointer backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            {playing
              ? <Pause className="w-8 h-8 text-white fill-white" />
              : <Play  className="w-8 h-8 text-white fill-white mr-[-2px]" />
            }
          </div>
        </div>
      )}

      {/* Speed picker popup */}
      {showSpeed && (
        <div className="absolute bottom-20 left-4 bg-gray-900/95 border border-white/10 rounded-xl overflow-hidden shadow-2xl" style={{ zIndex: 40 }}>
          <p className="text-[10px] font-bold text-gray-400 px-3 pt-2 pb-1 border-b border-white/10">سرعة التشغيل</p>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => changeSpeed(s)}
              className={`w-full text-center px-5 py-1.5 text-sm font-bold transition-colors ${speed === s ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
              {s === 1 ? 'عادي' : `${s}x`}
            </button>
          ))}
        </div>
      )}

      <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pt-10 pb-3">
          <div className="mb-3">
            <input type="range" min="0" max="100" step="0.1" value={progress} dir="ltr"
              className="player-range player-range-progress" style={{ '--pct': pct }}
              onMouseDown={() => { seeking.current = true; }}
              onMouseUp={() => { seeking.current = false; resetHideTimer(); }}
              onTouchStart={() => { seeking.current = true; resetHideTimer(); }}
              onTouchEnd={() => { seeking.current = false; resetHideTimer(); }}
              onChange={onSeekChange} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            </button>
            <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className="text-white/70 text-xs font-mono flex-shrink-0">{fmtSec(currentTime)} / {fmtSec(duration)}</span>
            <div className="flex-1" />
            {/* Speed button */}
            <button onClick={() => setShowSpeed(p => !p)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold transition-colors flex-shrink-0 ${speed !== 1 ? 'text-orange-400 bg-orange-400/10' : 'text-white/70 hover:text-white'}`}>
              <Gauge className="w-3.5 h-3.5" />
              {speed === 1 ? '1x' : `${speed}x`}
            </button>
            <button onClick={toggleMute} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className="w-20 flex-shrink-0 hidden sm:block">
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} dir="ltr"
                className="player-range player-range-volume" style={{ '--vol': vol }}
                onChange={onVolumeChange} />
            </div>
            {/* زر تدوير الشاشة — يظهر على الموبايل فقط */}
            <button
              onClick={toggleLandscape}
              className={`sm:hidden transition-colors flex-shrink-0 ${inVFs && deviceIsLandscape ? 'text-orange-400' : 'text-white hover:text-orange-400'}`}
              title="تدوير الشاشة"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {inVFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PDF Viewer ───────────────────────────────────────── */
function PdfViewer({ pdf }) {
  return <SecurePdfViewer pdf={pdf} />;
}

function CourseQuestionCard({ q, idx, answers, setAnswers, onImagePress }) {
  const defaultArabic = ['أ', 'ب', 'ج', 'د'];
  const rawLabels = Array.isArray(q.option_labels) && q.option_labels.length > 0 ? q.option_labels : defaultArabic;
  const options = [
    q.option_a && { letter: 'A', text: q.option_a, displayLabel: rawLabels[0] || defaultArabic[0] || 'أ' },
    q.option_b && { letter: 'B', text: q.option_b, displayLabel: rawLabels[1] || defaultArabic[1] || 'ب' },
    q.option_c && { letter: 'C', text: q.option_c, displayLabel: rawLabels[2] || defaultArabic[2] || 'ج' },
    q.option_d && { letter: 'D', text: q.option_d, displayLabel: rawLabels[3] || defaultArabic[3] || 'د' },
  ].filter(Boolean);

  const isImgMulti = q.question_type === 'image_multi';
  const selected = answers[q.id];
  const subAnswers = isImgMulti ? (selected || {}) : {};

  return (
    <div className="space-y-3">
      {q.question_text && (
        <p className="text-gray-900 dark:text-white text-xs sm:text-sm font-bold leading-relaxed">{q.question_text}</p>
      )}

      {q.question_image_url && (
        <QuestionImage
          src={q.question_image_url}
          alt="سؤال"
          maxHeightClass="max-h-56 sm:max-h-64"
          onImagePress={onImagePress}
          dark={true}
        />
      )}

      {isImgMulti ? (
        <div className="space-y-2.5">
          {options.some(o => o.text !== o.letter) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {options.map(({ letter, text, displayLabel }) => (
                <span key={letter} className="text-[11px] px-2 py-0.5 rounded-lg font-semibold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                  {displayLabel}: {text}
                </span>
              ))}
            </div>
          )}
          {(q.sub_questions || []).map(sub => {
            const subSel = subAnswers[sub.label];
            const isTF = sub.type === 'true_false';
            const subOptions = isTF
              ? [{ letter: 'A', label: 'صح' }, { letter: 'B', label: 'خطأ' }]
              : ['A', 'B', 'C', 'D'].slice(0, sub.option_labels?.length || 4)
                  .map((letter, i) => ({ letter, label: sub.option_labels?.[i] || defaultArabic[i] || letter }));
            return (
              <div key={sub.label} className="rounded-xl p-2.5 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 space-y-1.5">
                <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center justify-between">
                  <span>البند {sub.label}</span>
                  <span className="text-[10px] text-gray-500">({sub.points || 1} درجة)</span>
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {subOptions.map((opt) => {
                    const isSel = subSel === opt.letter;
                    return (
                      <button
                        key={opt.letter}
                        type="button"
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [sub.label]: opt.letter } }))}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isSel
                            ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                            : 'bg-white dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-purple-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {options.map(({ letter, text, displayLabel }) => {
            const isSelected = selected === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                className={`w-full text-right flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300 shadow-sm'
                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:border-purple-500/40 hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                  isSelected ? 'bg-purple-500 text-white' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300'
                }`}>
                  {displayLabel}
                </span>
                <span className="flex-1 leading-relaxed">{text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Recitations Tab Panel ──────────────────────────────
   Renders inline recitation list + take/result flow inside
   the CourseView sidebar without navigating away.
── */
function RecitationsTabPanel({ recitations, courseId, onRefresh, onPassed }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const getAnsKey = useCallback((recId) => user?.id ? `recitation_answers_${user.id}_${recId}` : `recitation_answers_${recId}`, [user?.id]);
  const getActKey = useCallback((recId) => user?.id ? `recitation_active_${user.id}_${recId}` : `recitation_active_${recId}`, [user?.id]);

  const [view, setView] = useState('list'); // 'list' | 'take' | 'result'
  const [selectedRec, setSelectedRec] = useState(null);
  const [examData, setExamData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [startingId, setStartingId] = useState(null); // [M3-FIX] tracks which rec.id is loading
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const timerRef = useRef(null);
  const timerEpochRef = useRef(null);
  const timerDurationRef = useRef(null);
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);
  const handleSubmitRef = useRef(null); // [H3-FIX] always-current ref, prevents stale closure in timer

  const timerBaseClientMsRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 3-2-1 countdown
  useEffect(() => {
    if (!showCountdown) return;
    if (countdown <= 0) { setShowCountdown(false); setView('take'); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [showCountdown, countdown]);

  // Drift-corrected server timer using monotonic performance.now() + server wall clock
  useEffect(() => {
    if (view !== 'take' || timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmitRef.current?.(true); return; }

    const calculateRemaining = () => {
      if (timerEpochRef.current === null || timerDurationRef.current === null) return 0;
      const perfElapsed = Math.floor((performance.now() - timerEpochRef.current) / 1000);
      const wallElapsed = timerBaseClientMsRef.current
        ? Math.floor((getServerNowMs() - timerBaseClientMsRef.current) / 1000)
        : perfElapsed;
      const effectiveElapsed = Math.max(perfElapsed, wallElapsed);
      return Math.max(0, timerDurationRef.current - effectiveElapsed);
    };

    const checkAndTick = () => {
      const trueLeft = calculateRemaining();
      setTimeLeft(trueLeft);
      if (trueLeft <= 0) {
        handleSubmitRef.current?.(true);
      }
    };

    timerRef.current = setTimeout(checkAndTick, 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' || (typeof document.hasFocus === 'function' && document.hasFocus())) {
        checkAndTick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [view, timeLeft]);

  // Save answers to localStorage
  useEffect(() => {
    if (view === 'take' && selectedRec) {
      try {
        localStorage.setItem(getAnsKey(selectedRec.id), JSON.stringify(answers));
      } catch (_) {}
    }
  }, [answers, view, selectedRec, getAnsKey]);

  // Cleanup saved answers on unmount if submitted
  useEffect(() => {
    return () => {
      if (submittedRef.current && selectedRec?.id) {
        try {
          localStorage.removeItem(getAnsKey(selectedRec.id));
          localStorage.removeItem(getActKey(selectedRec.id));
        } catch (_) {}
      }
      submittedRef.current = false;
    };
  }, [selectedRec, getAnsKey, getActKey]);

  const activeInProgressRec = useMemo(() => {
    if (view !== 'list') return null;
    try {
      for (const rec of recitations) {
        const savedAns = localStorage.getItem(getAnsKey(rec.id));
        const savedAct = localStorage.getItem(getActKey(rec.id));
        if (savedAns || savedAct) {
          const status = getRecStatus(rec);
          if (status === 'open') return rec;
        }
      }
    } catch (_) {}
    return null;
  }, [recitations, view, getAnsKey, getActKey]);

  const startRec = async (rec) => {
    if (startingId) return; // [M3-FIX] prevent double-start across all recs
    setStartingId(rec.id);
    submittedRef.current = false;
    setSubmitting(false);
    setResult(null);
    try {
      const { data } = await api.get(`/recitations/${rec.id}/take`);
      setExamData(data);
      setSelectedRec(rec);
      // [H2-FIX] Guard against corrupted localStorage JSON (e.g. after a browser crash)
      let restoredAnswers = {};
      const saved = localStorage.getItem(getAnsKey(rec.id));
      if (saved) {
        try { restoredAnswers = JSON.parse(saved); }
        catch { localStorage.removeItem(getAnsKey(rec.id)); }
      }
      setAnswers(restoredAnswers);

      const durationSecs = (data.recitation?.duration_minutes || rec.duration_minutes || 10) * 60;
      let remainingSecs = durationSecs;

      if (typeof data.remaining_seconds === 'number' && !isNaN(data.remaining_seconds)) {
        remainingSecs = Math.max(0, data.remaining_seconds);
      } else if (data.server_started_at) {
        const serverNowMs = data.server_now ? new Date(data.server_now).getTime() : getServerNowMs();
        const startedAtMs = new Date(data.server_started_at).getTime();
        if (!isNaN(startedAtMs)) {
          const elapsedSecs = Math.max(0, Math.floor((serverNowMs - startedAtMs) / 1000));
          remainingSecs = Math.max(0, durationSecs - elapsedSecs);
        }
      }

      timerBaseClientMsRef.current = getServerNowMs();
      timerEpochRef.current = performance.now();
      timerDurationRef.current = remainingSecs;
      setTimeLeft(remainingSecs);
      setCurrentQuestionIdx(0);
      try { localStorage.setItem(getActKey(rec.id), '1'); } catch (_) {}

      if (data.resumed) {
        setView('take');
      } else {
        setShowCountdown(true);
        setCountdown(3);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'حدث خطأ');
    } finally {
      setStartingId(null); // [M3-FIX]
    }
  };

  const handleSubmit = useCallback(async (auto = false) => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    if (!mountedRef.current) return;
    setSubmitting(true);
    clearTimeout(timerRef.current);
    const qs = examData?.questions || [];
    const payload = qs.map(q => ({
      question_id: q.id,
      answer: q.question_type === 'image_multi'
        ? JSON.stringify(answers[q.id] || {})
        : (answers[q.id] || null),
    }));
    try {
      const { data } = await api.post(`/recitations/${selectedRec.id}/submit`, { answers: payload });
      if (!mountedRef.current) return;
      try {
        localStorage.removeItem(getAnsKey(selectedRec.id));
        localStorage.removeItem(getActKey(selectedRec.id));
      } catch (_) {}
      setResult(data);
      setView('result');
      setSubmitting(false);
      submittedRef.current = false;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['course-recitations', courseId] }),
        qc.invalidateQueries({ queryKey: ['student-recitations'] }),
        qc.invalidateQueries({ queryKey: ['student-recitation-results'] }),
        qc.invalidateQueries({ queryKey: ['student-courses'] }),
      ]);
      onRefresh?.();
      // [M4-FIX] If the student just passed, notify parent to switch to videos tab
      if (data.passed) onPassed?.();
    } catch (e) {
      if (!mountedRef.current) return;
      submittedRef.current = false;
      setSubmitting(false);
      const errData = e.response?.data || {};
      if (errData.already_submitted) {
        toast('تم تسليم التسميع بالفعل', { icon: 'ℹ️' });
        try {
          localStorage.removeItem(getAnsKey(selectedRec?.id));
          localStorage.removeItem(getActKey(selectedRec?.id));
        } catch (_) {}
        setView('list');
        qc.invalidateQueries({ queryKey: ['course-recitations', courseId] });
        qc.invalidateQueries({ queryKey: ['student-recitations'] });
        qc.invalidateQueries({ queryKey: ['student-recitation-results'] });
        onRefresh?.();
      } else if (errData.timer_expired) {
        toast.error('انتهى وقت التسميع');
        try {
          localStorage.removeItem(getAnsKey(selectedRec?.id));
          localStorage.removeItem(getActKey(selectedRec?.id));
        } catch (_) {}
        setView('list');
        qc.invalidateQueries({ queryKey: ['course-recitations', courseId] });
        qc.invalidateQueries({ queryKey: ['student-recitations'] });
        qc.invalidateQueries({ queryKey: ['student-recitation-results'] });
        onRefresh?.();
      } else {
        toast.error(errData.error || 'حدث خطأ أثناء التسليم');
      }
    }
  }, [examData, answers, selectedRec, submitting, qc, courseId, onPassed, onRefresh, getAnsKey, getActKey]);

  // [H3-FIX] Keep handleSubmitRef always pointing to the latest handleSubmit.
  // Assigned in render so the timer effect never captures a stale closure.
  handleSubmitRef.current = handleSubmit;

  const backToList = () => {
    setView('list');
    setResult(null);
    setExamData(null);
    setCurrentQuestionIdx(0);
    submittedRef.current = false;
    setSubmitting(false);
    onRefresh?.();
  };

  // ── COUNTDOWN ──
  if (showCountdown) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-gradient-to-br from-purple-900 to-indigo-900">
        <p className="text-white/80 text-sm font-bold mb-3">يبدأ التسميع بعد...</p>
        <div className="text-white font-black" style={{ fontSize: 80, lineHeight: 1 }}>{countdown}</div>
        <p className="text-white/60 text-xs mt-4">{selectedRec?.title}</p>
      </div>
    );
  }

  // ── TAKE VIEW ──
  if (view === 'take' && examData) {
    const questions = examData.questions || [];
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const urgent = timeLeft < 60;
    const answered = questions.filter(q => {
      if (q.question_type === 'image_multi') return Object.keys(answers[q.id] || {}).length > 0;
      return !!answers[q.id];
    }).length;

    const safeIdx = Math.min(currentQuestionIdx, questions.length - 1);
    const q = questions[safeIdx];
    const isFirst = safeIdx === 0;
    const isLast = safeIdx === questions.length - 1;

    const isQAnswered = (qid) => {
      const a = answers[qid];
      if (a && typeof a === 'object') return Object.keys(a).length > 0;
      return !!a;
    };

    return (
      <>
      <div className="flex flex-col h-full overflow-hidden" dir="rtl">
        {/* Timer bar */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-white/10 flex items-center justify-between flex-shrink-0 bg-white dark:bg-[#0A0910]">
          <div>
            <p className="text-gray-900 dark:text-white text-xs font-black truncate max-w-[140px]">{selectedRec?.title}</p>
            <p className="text-gray-500 text-[10px]">{answered}/{questions.length} إجابة</p>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-sm tabular-nums ${
            urgent ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-purple-500/10 text-purple-400'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {mins}:{String(secs).padStart(2, '0')}
          </div>
        </div>

        {/* Question number grid */}
        <div className="flex flex-wrap gap-1 justify-center py-2 px-1 border-b border-gray-200 dark:border-white/10 flex-shrink-0 bg-gray-50 dark:bg-white/5">
          {questions.map((qq, idx) => {
            const isAnswered = isQAnswered(qq.id);
            const isCurrent = idx === safeIdx;
            return (
              <button
                key={qq.id}
                onClick={() => setCurrentQuestionIdx(idx)}
                className={`w-7 h-7 rounded-lg text-xs font-black transition-all border ${
                  isCurrent
                    ? 'bg-purple-500 text-white border-purple-500 shadow scale-105'
                    : isAnswered
                    ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-400/40'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-500 border-gray-200 dark:border-white/10 hover:border-purple-300'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Question separator badge */}
        {q && (
          <div className="flex items-center gap-2 my-2 px-3 flex-shrink-0">
            <div className="flex-1 h-px bg-purple-500/20" />
            <span className="text-[11px] font-black text-purple-600 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full whitespace-nowrap">
              السؤال {safeIdx + 1} من {questions.length}
              <span className="opacity-40 mx-1">·</span>
              <span className="font-medium text-[10px]">
                {q.question_type === 'true_false' ? 'صح / خطأ' : q.question_type === 'image_multi' ? 'صورة + أسئلة' : 'اختيار من متعدد'}
              </span>
            </span>
            <div className="flex-1 h-px bg-purple-500/20" />
          </div>
        )}

        {/* Current question content */}
        <div className="flex-1 overflow-y-auto p-3">
          {q && (
            <CourseQuestionCard
              key={q.id}
              q={q}
              idx={safeIdx}
              answers={answers}
              setAnswers={setAnswers}
              onImagePress={setLightboxSrc}
            />
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-3 border-t border-gray-200 dark:border-white/10 flex items-center justify-between gap-2 flex-shrink-0 bg-white dark:bg-[#0A0910]">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => setCurrentQuestionIdx(i => Math.max(0, i - 1))}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
          >
            <ChevronRight className="w-4 h-4" /> السابق
          </button>

          <div className="flex items-center gap-1 overflow-x-auto max-w-[120px] py-1">
            {questions.map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                onClick={() => setCurrentQuestionIdx(dotIdx)}
                className={`w-2 h-2 rounded-full transition-all flex-shrink-0 ${
                  dotIdx === safeIdx
                    ? 'bg-purple-500 w-4'
                    : isQAnswered(questions[dotIdx].id)
                    ? 'bg-purple-400/50'
                    : 'bg-gray-700'
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                if (window.confirm(`هل أنت متأكد من تسليم التسميع؟\nأجبت على ${answered} من ${questions.length} أسئلة`)) {
                  handleSubmit(false);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 transition-colors shadow-lg shadow-green-600/20"
            >
              {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              تسليم
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentQuestionIdx(i => Math.min(questions.length - 1, i + 1))}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-black text-white bg-purple-600 hover:bg-purple-700 transition-colors"
            >
              التالي <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </>
    );
  }

  // ── RESULT VIEW ──
  if (view === 'result' && result) {
    const { score = 0, correct = 0, wrong = 0, unanswered = 0, passed = false, total_score = 0, pass_score = 0, points_earned = 0 } = result;
    return (
      <div className="p-4 space-y-3 h-full overflow-y-auto" dir="rtl">
        <div className={`p-4 rounded-2xl text-center text-white ${
          passed ? 'bg-gradient-to-br from-green-600 to-emerald-700' : 'bg-gradient-to-br from-red-600 to-rose-700'
        }`}>
          <div className="text-3xl mb-1">{passed ? '🎉' : '📚'}</div>
          <div className="text-3xl font-black">{score}<span className="text-lg opacity-70">/{total_score}</span></div>
          <p className="text-xs font-bold mt-0.5">{passed ? 'أحسنت! نجحت في التسميع' : 'حاول أكثر في المرة القادمة'}</p>
          <p className="text-white/70 text-[10px]">درجة النجاح: {pass_score}/{total_score}</p>
          {points_earned > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 bg-white/20 rounded-lg px-2.5 py-1 text-xs font-black">
              <Trophy className="w-3.5 h-3.5" /> +{points_earned} نقطة
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['✅', 'صحيح', correct, 'text-green-600 dark:text-green-400'], ['❌', 'خطأ', wrong, 'text-red-500 dark:text-red-400'], ['⬜', 'بلا إجابة', unanswered, 'text-gray-500 dark:text-gray-400']].map(([icon, label, val, cls]) => (
            <div key={label} className="bg-gray-100 dark:bg-white/5 rounded-xl p-2.5 text-center border border-gray-200 dark:border-white/10">
              <div className="text-lg">{icon}</div>
              <div className={`text-lg font-black ${cls}`}>{val}</div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>
        {result?.result?.id && (
          <button
            onClick={() => navigate(`/student/recitation-review/${result.result.id}`, { state: { backTo: `/student/courses/${courseId}` } })}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-indigo-500/30"
          >
            <Eye className="w-3.5 h-3.5" /> مراجعة مفصّلة
          </button>
        )}
        {!passed && selectedRec && (() => {
          // [retake-grant] An unused teacher-granted retake overrides both
          // allow_retry=false and max_retry_attempts (server enforces the same).
          const attempts = parseInt(selectedRec.my_attempt_count, 10) || 1;
          const maxAttempts = selectedRec.max_retry_attempts ? parseInt(selectedRec.max_retry_attempts, 10) : null;
          const maxReached = maxAttempts && attempts >= maxAttempts;
          const allowRetry = Boolean(selectedRec.allow_retry);
          const unusedGrants = parseInt(selectedRec.unused_grants, 10) || 0;
          const hasGrant = unusedGrants > 0;
          if (!(allowRetry || hasGrant)) return null;
          if (maxReached && !hasGrant) return null;
          return (
            <button
              onClick={() => startRec(selectedRec)}
              className={`w-full flex items-center justify-center gap-2 font-bold text-xs py-2.5 rounded-xl transition-colors border ${
                hasGrant
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                  : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/30'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {hasGrant ? 'محاولة إضافية من المعلم 🎁' : `أعد المحاولة ${maxAttempts ? `(${attempts + 1}/${maxAttempts})` : ''}`}
            </button>
          );
        })()}
        <button onClick={backToList}
          className="w-full py-2.5 rounded-xl font-bold text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          العودة للقائمة →
        </button>
      </div>
    );
  }

  // [M1-FIX] Determine schedule status for each recitation
  const getRecStatus = (rec) => {
    const now = new Date();
    const startDate = toUTCDate(rec.start_date);
    const endDate = toUTCDate(rec.end_date);
    if (startDate && startDate > now) return 'upcoming';
    if (endDate && endDate < now) return 'expired';
    return 'open';
  };

  // ── LIST VIEW ──
  // The course tab shows ONLY the recitations the student still has to do
  // (not yet passed). Completed ones are available in the full recitations page.
  const pendingRecitations = recitations.filter(rec => !isRecPassed(rec));

  if (recitations.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 h-full" dir="rtl">
        <div className="flex flex-col items-center justify-center flex-1 min-h-[180px] p-4 text-center">
          <BookOpen className="w-10 h-10 text-gray-400 dark:text-gray-700 mb-2" />
          <p className="text-gray-500 dark:text-gray-600 text-sm font-semibold">لا توجد تسميعات مرتبطة بهذا الكورس</p>
        </div>
        {/* [C2-FIX] Link to standalone recitations so students can still access non-course-linked ones */}
        <div className="px-3 pb-3 border-t border-gray-200 dark:border-white/10 pt-3 flex-shrink-0">
          <button
            onClick={() => navigate('/student/recitations')}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all border border-purple-300 dark:border-purple-500/40 shadow-sm hover:shadow-purple-200 dark:hover:shadow-none active:scale-95">
            <BookOpen className="w-3.5 h-3.5" /> عرض كل التسميعات
          </button>
        </div>
      </div>
    );
  }

  if (pendingRecitations.length === 0) {
    // All recitations passed — celebrate and link to the full history page
    return (
      <div className="flex-1 flex flex-col min-h-0 h-full" dir="rtl">
        <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] p-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 mb-2">
            <CheckCircle className="w-6 h-6" />
          </div>
          <p className="text-gray-900 dark:text-white text-sm font-black mb-1">أحسنت! 🎉</p>
          <p className="text-gray-600 dark:text-gray-400 text-xs font-semibold">اجتزت كل التسميعات المطلوبة في هذا الكورس</p>
          <p className="text-gray-500 dark:text-gray-600 text-[11px] mt-1">يمكنك الآن متابعة جميع المحاضرات</p>
        </div>
        <div className="px-3 pb-3 border-t border-gray-200 dark:border-white/10 pt-2 flex-shrink-0">
          <button
            onClick={() => navigate('/student/recitations')}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all border border-purple-300 dark:border-purple-500/40 shadow-sm hover:shadow-purple-200 dark:hover:shadow-none active:scale-95">
            <BookOpen className="w-3.5 h-3.5" /> عرض كل التسميعات (المكتملة) ✓
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full" dir="rtl">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Dedicated Active In-Progress Banner in Course Tab */}
        {activeInProgressRec && (
          <div className="rounded-2xl p-3.5 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-purple-500/15 border-2 border-amber-400/80 dark:border-amber-500/60 shadow-lg shadow-amber-500/10 transition-all">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-black bg-gradient-to-r from-amber-500 to-orange-600 text-white px-2.5 py-0.5 rounded-full shadow-sm animate-pulse flex items-center gap-1">
                ⚡ لديك تسميع جارٍ
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40">
                الوقت مستمر ⏳
              </span>
            </div>
            <p className="text-gray-900 dark:text-white text-xs font-black truncate mb-2.5">{activeInProgressRec.title}</p>
            <button
              onClick={() => startRec(activeInProgressRec)}
              disabled={!!startingId}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
            >
              {startingId === activeInProgressRec.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              استئناف التسميع الآن
            </button>
          </div>
        )}

        {pendingRecitations.map((rec, idx) => {
          const hasResult = !!rec.result_id;
          const passed = isRecPassed(rec);
          const status = getRecStatus(rec); // [M1-FIX]
          const isExpired = status === 'expired';
          const isUpcoming = status === 'upcoming';
          const attempts = parseInt(rec.my_attempt_count, 10) || (hasResult ? 1 : 0);
          const maxAttempts = rec.max_retry_attempts ? parseInt(rec.max_retry_attempts, 10) : null;
          const maxReached = maxAttempts && attempts >= maxAttempts;
          // [retake-grant] An unused teacher-granted retake overrides both
          // allow_retry=false and max_retry_attempts so the button stays enabled.
          // The server's /take endpoint enforces the same rule.
          const unusedGrants = parseInt(rec.unused_grants, 10) || 0;
          const hasGrant = unusedGrants > 0;
          const canRetry = (Boolean(rec.allow_retry) || hasGrant) && (hasGrant || !maxReached);
          const canStart = !passed && !isExpired && !isUpcoming && (!hasResult || canRetry);

          const isActiveSession = !!localStorage.getItem(getAnsKey(rec.id)) || !!localStorage.getItem(getActKey(rec.id));

          // A recitation gates the next video only when it has linked videos AND
          // the student hasn't passed it yet — surface this clearly so the student
          // knows exactly what to do to proceed.
          const gatesVideo = Array.isArray(rec.video_ids) && rec.video_ids.length > 0 && !passed;
          return (
            <div key={rec.id} className={`rounded-2xl border p-3.5 transition-all ${
              passed
                ? 'border-green-500/30 bg-green-500/5'
                : isActiveSession
                ? 'border-2 border-amber-400 dark:border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-amber-500/5 shadow-md shadow-amber-500/5'
                : hasResult
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5'
            }`}>
              <div className="flex items-start gap-2.5 mb-2.5">
                {/* Sequential number so the student sees the required order (1, 2, 3...) */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black transition-all ${
                  passed
                    ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                    : isActiveSession
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm shadow-orange-500/20'
                    : hasResult
                    ? 'bg-red-500/20 text-red-500 dark:text-red-400'
                    : 'bg-purple-500/20 text-purple-600 dark:text-purple-300'
                }`}>
                  {passed ? <CheckCircle className="w-4 h-4" /> : isActiveSession ? <RotateCcw className="w-4 h-4" /> : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-gray-900 dark:text-white text-xs sm:text-sm font-black truncate">{rec.title}</p>
                    {isActiveSession && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs animate-pulse">
                        ⚡ جلسة نشطة
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                      <Clock className="w-2.5 h-2.5 inline ml-0.5" />{rec.duration_minutes} دقيقة
                    </span>
                    <span className="text-[10px] text-gray-400">•</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{rec.question_count} سؤال</span>
                    {hasResult && !isActiveSession && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                        passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {rec.my_score}/{rec.total_score} · {passed ? 'ناجح ✓' : 'راسب ✗'}
                      </span>
                    )}
                    {/* [M1-FIX] Schedule status badges */}
                    {isExpired && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-gray-500/20 text-gray-400">
                        انتهى الوقت
                      </span>
                    )}
                    {isUpcoming && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400">
                        لم يبدأ بعد
                      </span>
                    )}
                  </div>
                  {/* Linked-video context: show which lecture this recitation unlocks */}
                  {rec.linked_video_title && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                      <Video className="w-2.5 h-2.5 inline" />
                      يفتح: <span className="text-gray-700 dark:text-gray-300 font-semibold truncate">{rec.linked_video_title}</span>
                    </p>
                  )}
                  {/* Prominent gate hint for unpassed recitations that block the next video */}
                  {gatesVideo && (() => {
                    const siblingCount = recitations.filter(r =>
                      !isRecPassed(r) &&
                      Array.isArray(r.video_ids) &&
                      r.video_ids.map(Number).some(id => (rec.video_ids || []).map(Number).includes(id))
                    ).length;
                    const primary = !hasResult
                      ? 'أجب هذا التسميع لفتح المحاضرة'
                      : canRetry
                      ? 'أعد المحاولة لفتح المحاضرة'
                      : 'يجب النجاح لفتح المحاضرة';
                    return (
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10px] font-black flex items-center gap-1 text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-1">
                          <Lock className="w-3 h-3 inline" />
                          {primary}
                          {rec.linked_video_title ? ` «${rec.linked_video_title}»` : ' التالية'}
                        </p>
                        {siblingCount > 1 && (
                          <p className="text-[10px] font-bold flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <BookOpen className="w-3 h-3 inline" />
                            هذا واحد من {siblingCount} تسميع/ات مطلوبة لفتح نفس المحاضرة
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex gap-2">
                {canStart && (
                  <button
                    onClick={() => startRec(rec)}
                    disabled={startingId === rec.id} // [M3-FIX] only disable the specific rec
                    className={`flex-1 py-2 rounded-xl text-xs font-black text-white disabled:opacity-60 transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm ${
                      isActiveSession
                        ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-orange-500/20'
                        : hasGrant
                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                        : 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'
                    }`}>
                    {startingId === rec.id ? (
                      <RefreshCw className="w-3.5 h-3.5 inline animate-spin" />
                    ) : isActiveSession ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>استئناف التسميع</span>
                      </>
                    ) : hasResult ? (
                      hasGrant
                        ? 'محاولة إضافية 🎁'
                        : `أعد المحاولة${maxAttempts ? ` (${attempts}/${maxAttempts})` : ''}`
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>ابدأ التسميع</span>
                      </>
                    )}
                  </button>
                )}
                {/* [retake-grant] Only show the closed message when the student
                    truly cannot retry: max reached AND no grant pending. With a
                    grant, the button above is the granted retry and this message
                    is suppressed. */}
                {hasResult && !passed && !canRetry && (
                  <div className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/20">
                    {maxReached ? `استنفدت المحاولات (${maxAttempts})` : 'إعادة المحاولة مغلقة'}
                  </div>
                )}
                {rec.result_id && (
                  <button
                    onClick={() => navigate(`/student/recitation-review/${rec.result_id}`, { state: { backTo: `/student/courses/${courseId}` } })}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors border border-indigo-500/20 flex items-center justify-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span>مراجعة</span>
                  </button>
                )}
                {passed && (
                  <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-3.5 h-3.5" /> اجتزت التسميع
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Link to the full recitations page — shows ALL recitations
          (pending + completed) so the student can review past results. */}
      <div className="px-3 pb-3 border-t border-gray-200 dark:border-white/10 pt-2 flex-shrink-0 bg-white dark:bg-gray-900">
        <button
          onClick={() => navigate('/student/recitations')}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all border border-purple-300 dark:border-purple-500/40 shadow-sm hover:shadow-purple-200 dark:hover:shadow-none active:scale-95">
          <BookOpen className="w-3.5 h-3.5" /> عرض كل التسميعات
        </button>
      </div>
    </div>
  );
}

function SidebarQuestionCard({ q, idx, answers, setAnswers }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const defaultArabic = ['أ', 'ب', 'ج', 'د'];
  const rawLabels = Array.isArray(q.option_labels) && q.option_labels.length > 0 ? q.option_labels : defaultArabic;
  const options = [
    q.option_a && { letter: 'A', text: q.option_a, displayLabel: rawLabels[0] || 'أ' },
    q.option_b && { letter: 'B', text: q.option_b, displayLabel: rawLabels[1] || 'ب' },
    q.option_c && { letter: 'C', text: q.option_c, displayLabel: rawLabels[2] || 'ج' },
    q.option_d && { letter: 'D', text: q.option_d, displayLabel: rawLabels[3] || 'د' },
  ].filter(Boolean);

  const isImgMulti = q.question_type === 'image_multi';
  const selected = answers[q.id];
  const subAnswers = isImgMulti ? (selected || {}) : {};
  const hasAny = isImgMulti ? Object.keys(subAnswers).length > 0 : !!selected;

  return (
    <>
    <div className={`rounded-xl p-3 border transition-all ${hasAny ? 'border-purple-500/40 bg-purple-500/5' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5'}`}>
      <div className="flex items-start gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">{idx + 1}</span>
        {q.question_text && (
          <p className="text-gray-800 dark:text-gray-200 text-xs font-semibold flex-1">{q.question_text}</p>
        )}
      </div>
      {q.question_image_url && (
        <QuestionImage
          src={q.question_image_url}
          alt="سؤال"
          maxHeightClass="max-h-64 sm:max-h-80"
          onImagePress={(url) => setLightboxSrc(url)}
        />
      )}
      {isImgMulti ? (
        <div className="space-y-1.5">
          {options.some(o => o.text !== o.letter) && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {options.map(({ letter, text, displayLabel }) => (
                <span key={letter} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400">{displayLabel || letter}: {text}</span>
              ))}
            </div>
          )}
          {(q.sub_questions || []).map(sub => {
            const subSel = subAnswers[sub.label];
            const isTF = sub.type === 'true_false';
            const subOptionLabels = Array.isArray(sub.option_labels) && sub.option_labels.length > 0 ? sub.option_labels : rawLabels;
            const subOptions = isTF
              ? [{ letter: 'A', label: 'صح' }, { letter: 'B', label: 'خطأ' }]
              : ['A', 'B', 'C', 'D'].slice(0, sub.option_labels?.length || 4).map((letter, i) => ({
                  letter,
                  label: subOptionLabels[i] || defaultArabic[i] || letter,
                }));
            return (
              <div key={sub.label} className="rounded-lg p-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                  <span>البند {sub.label}</span>
                  <span className="text-[9px] text-gray-500 font-normal">({sub.points || 1} درجة)</span>
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {subOptions.map((opt) => (
                    <button key={opt.letter}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [sub.label]: opt.letter } }))}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        subSel === opt.letter
                          ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                          : 'bg-gray-100 dark:bg-white/5 border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-purple-500 dark:hover:border-purple-400'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1.5">
          {options.map(({ letter, text, displayLabel }) => (
            <button key={letter}
              onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
              className={`w-full text-right flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                selected === letter
                  ? 'bg-purple-500 text-white border-purple-500'
                  : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:border-purple-500 dark:hover:border-purple-400'
              }`}>
              <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 ${selected === letter ? 'bg-white/20' : 'bg-gray-200 dark:bg-white/10 text-purple-600 dark:text-purple-400'}`}>{displayLabel || letter}</span>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
    {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}

/* ─── Main Page ────────────────────────────────────────── */
export default function CourseView() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeVideo, setActiveVideo] = useState(null);
  const [activePdf, setActivePdf] = useState(null);
  const [activeTab, setActiveTab] = useState('videos');

  const getInitialPosition = (video) => {
    if (!video) return 0;
    const serverPos = parseFloat(video.saved_position) || 0;
    const localPos  = loadVidPos(video.id);
    const pos = Math.max(serverPos, localPos);
    // If video was completed (progress >= 95% or position within 10s of duration), restart from 0
    const durSec = (video.duration_minutes || 0) * 60;
    if (durSec > 0 && pos >= durSec - 10) return 0;
    if (video.saved_progress >= 95) return 0;
    return pos;
  };

  // [Phase 5] Auto-advance uses these refs because handleProgressUpdate fires
  // from inside a video player callback chain that may run during a tab switch
  // before React re-renders. BOTH refs MUST be updated whenever their state
  // changes (see the useEffects at the bottom of the hook), otherwise the lock
  // check could run against a stale snapshot.
  const contentRef = useRef(null);
  const recitationsRef = useRef([]);

  const handleProgressUpdate = (videoId, watchedMinutes, progressPct, completed, lastPosition = 0, actualWatchedSec = 0) => {
    saveVidPos(videoId, lastPosition);
    api.post('/students/me/video-progress', {
      video_id: videoId,
      watched_minutes: Math.round(watchedMinutes),
      progress_percentage: Math.min(100, Math.round(progressPct)),
      watch_count_increment: completed ? 1 : 0,
      last_position: Math.round(lastPosition || 0),
      actual_watched_seconds: Math.round(actualWatchedSec || 0),
    }).catch(() => {});

    if (completed) {
      const currentVids = contentRef.current?.videos || [];
      const idx = currentVids.findIndex(v => v.id === videoId);
      if (idx !== -1) {
        const next = currentVids[idx + 1];
        if (next) {
          // Check if next video is locked by an uncleared recitation
          const recs = recitationsRef.current || [];
          const nextLocked = recs.some(rec => {
            const vids = Array.isArray(rec.video_ids) ? rec.video_ids.map(Number) : [];
            return vids.includes(next.id) && !isRecPassed(rec);
          });
          if (!nextLocked) {
            setTimeout(() => setActiveVideo(next), 1500);
          }
        }
      }
    }
  };

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/student/my-courses').then(r => r.data),
  });

  // BUG-13: wait for courses list before firing the content query so the client-side
  // enrollment guard has a chance to redirect *before* content is fetched.
  const { data: content, isLoading, error: contentError } = useQuery({
    queryKey: ['course-content', courseId],
    queryFn: () => api.get(`/courses/${courseId}/content`).then(r => r.data),
    enabled: !!courseId && !coursesLoading,
    retry: false,
  });

  // Keep contentRef in sync so handleProgressUpdate auto-advance always has latest video list
  useEffect(() => { contentRef.current = content; }, [content]);

  useEffect(() => {
    if (contentError) {
      const status = contentError?.response?.status;
      if (status === 403) {
        toast.error('غير مصرح لك بالدخول لهذا الكورس');
        navigate('/student/courses', { replace: true });
      }
    }
  }, [contentError, navigate]);

  const { data: examResults = [] } = useQuery({
    queryKey: ['course-exam-results', courseId],
    queryFn: () => api.get(`/exams/student/course-results/${courseId}`).then(r => r.data),
    enabled: !!courseId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: courseRecitations = [], refetch: refetchRecitations } = useQuery({
    queryKey: ['course-recitations', courseId],
    queryFn: () => api.get(`/recitations/student/course/${courseId}`).then(r => r.data),
    enabled: !!courseId && !coursesLoading,
    // Always fetch fresh recitations — teacher can add/remove them any time.
    // staleTime:0 means the cache is immediately considered stale and refetched
    // on mount without waiting for the global 15-minute window.
    staleTime: 0,
  });

  // Keep recitationsRef in sync so handleProgressUpdate auto-advance lock check uses latest data
  useEffect(() => { recitationsRef.current = courseRecitations; }, [courseRecitations]);

  const course = courses.find(c => String(c.id) === String(courseId));

  /* ── Access guard: redirect if courses finished loading and this one isn't enrolled ── */
  useEffect(() => {
    if (!coursesLoading && courseId) {
      const found = courses.find(c => String(c.id) === String(courseId));
      if (!found) {
        toast.error('ليس لديك صلاحية الوصول لهذا الكورس');
        navigate('/student/courses', { replace: true });
      }
    }
  }, [courses, coursesLoading, courseId, navigate]);

  const videos = content?.videos || [];
  const pdfs = content?.pdfs || [];
  const exams = content?.exams || [];

  /* ── Video lock logic ──
     [C1-FIX] Lock is now SERVER-AUTHORITATIVE: the server annotates each video
     with is_locked=true when any linked recitation is not yet passed by this student.
     The client falls back to the recitations data only when is_locked is not present
     (e.g. teacher preview where the content endpoint returns no is_locked field).
     [H6-FIX] Memoize the locked-id set so isVideoLocked is O(1) per call.

     [Phase 5] CONTRACT for the `videoIndex === 0` short-circuit:
       The FIRST video is always free by design so a student can begin a course
       without first solving a recitation they've never seen. The server
       enforces this in server/routes/courses.js (the `i > 0` check on
       is_locked annotation). The teacher UI now warns about it (see
       client/src/pages/teacher/Recitations.jsx).
       DO NOT remove this without coordinating with the server-side carve-out.
  ── */
  const isVideoLocked = useCallback((video, videoIndex) => {
    if (videoIndex === 0) return false;
    // Use server-provided flag if available
    if (typeof video.is_locked === 'boolean') return video.is_locked;
    // Fallback for teacher preview (server does not set is_locked for non-students)
    return courseRecitations.some(rec => {
      const vids = Array.isArray(rec.video_ids) ? rec.video_ids.map(Number) : [];
      return vids.includes(video.id) && !isRecPassed(rec);
    });
  }, [courseRecitations]);

  const currentVideo = activeVideo || videos[0] || null;
  const currentPdf = activePdf || pdfs[0] || null;

  const tabs = [
    { key: 'videos', label: 'المحاضرات', icon: Video, count: videos.length },
    { key: 'pdfs', label: 'الملفات', icon: FileText, count: pdfs.length },
    { key: 'recitations', label: 'التسميع', icon: BookOpen, count: courseRecitations.length },
  ];

  // [Mobile expand/collapse] On phones the tab-picker box (aside) eats a fixed
  // 34vh even while the student is deep into a PDF or a recitation. Let them
  // collapse it out of the way and bring it back whenever they want.
  const [contentExpanded, setContentExpanded] = useState(false);
  useEffect(() => { setContentExpanded(false); }, [activeTab]);
  const canExpand = activeTab === 'pdfs' || activeTab === 'recitations';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">

      {/* ── Breadcrumb Header ── */}
      <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-white/10 px-5 py-3 flex items-center gap-3 z-10">
        <button
          onClick={() => navigate('/student/courses')}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>كورساتي</span>
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-600" />
        <span className="text-sm font-black text-gray-900 dark:text-white truncate">{course?.name || '…'}</span>

        {course && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">
              {videos.length} محاضرة · {pdfs.length} ملف
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col-reverse md:flex-row overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className={`w-full h-[34vh] md:w-80 md:h-auto flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t md:border-t-0 md:border-l border-gray-200 dark:border-white/10 flex-col overflow-hidden ${contentExpanded ? 'hidden md:flex' : 'flex'}`}>

          {/* Course info strip — desktop only */}
          <div className="hidden md:block flex-shrink-0 px-4 py-4 border-b border-gray-200 dark:border-white/10 bg-gradient-to-b from-orange-500/10 to-transparent">
            <p className="text-gray-900 dark:text-white font-black text-sm leading-relaxed line-clamp-2">{course?.name}</p>
            {course?.target_stage && (
              <span className="mt-1.5 inline-block text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                {course.target_stage}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-white/10">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-bold transition-all border-b-2 ${
                  activeTab === tab.key
                    ? 'text-orange-500 dark:text-orange-400 border-orange-500 dark:border-orange-400 bg-orange-400/5'
                    : 'text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-black leading-none ${
                  activeTab === tab.key ? 'bg-orange-400/20 text-orange-500 dark:text-orange-300' : 'bg-gray-200 dark:bg-white/5 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-gray-200 dark:bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : activeTab === 'videos' ? (
              <div className="p-3 space-y-1.5">
                {videos.length === 0 ? (
                  <EmptyState icon={Video} text="لا توجد محاضرات بعد" />
                ) : videos.map((v, i) => {
                  const isActive = currentVideo?.id === v.id;
                  const locked = isVideoLocked(v, i);
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        if (locked) {
                          toast.error('يجب اجتياز التسميع أولاً للوصول لهذه المحاضرة');
                          setActiveTab('recitations');
                          return;
                        }
                        setActiveVideo(v); setActiveTab('videos');
                      }}
                      className={`w-full text-right flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                        locked
                          ? 'opacity-50 cursor-not-allowed text-gray-500'
                          : isActive
                          ? 'bg-orange-500 shadow-lg shadow-orange-500/20'
                          : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${
                        locked ? 'bg-gray-200 dark:bg-white/5 text-gray-500 dark:text-gray-600'
                          : isActive ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-white/5 text-gray-500'
                      }`}>
                        {locked
                          ? <Lock className="w-4 h-4" />
                          : isActive
                          ? <Play className="w-4 h-4 text-white fill-white" />
                          : <span>{i + 1}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm truncate ${isActive ? 'text-white' : locked ? 'text-gray-500 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                          {v.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {locked && (() => {
                            const p = computeLockProgress(v, courseRecitations);
                            if (!p) return (
                              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">
                                🔒 يتطلب تسميع
                              </span>
                            );
                            const allPassed = p.passed >= p.total;
                            return (
                              <>
                                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">
                                  🔒 {p.passed}/{p.total} تسميع
                                </span>
                                <span className="flex gap-0.5">
                                  {p.linkedRecs.map(r => (
                                    <span
                                      key={r.id}
                                      title={r.title}
                                      className={`w-2 h-2 rounded-full ${isRecPassed(r) ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    />
                                  ))}
                                </span>
                                {allPassed && (
                                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    ✓ جاهز للعرض
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {!locked && v.duration_minutes > 0 && (
                            <p className={`text-xs flex items-center gap-1 ${isActive ? 'text-white/60' : 'text-gray-500 dark:text-gray-600'}`}>
                              <Clock className="w-3 h-3" /> {fmt(v.duration_minutes)}
                            </p>
                          )}
                          {!locked && v.saved_progress > 0 && (
                            <span className={`text-[10px] font-bold ${isActive ? 'text-white/70' : 'text-orange-500 dark:text-orange-400'}`}>
                              {Math.round(v.saved_progress)}%
                            </span>
                          )}
                        </div>
                        {!locked && v.saved_progress > 0 && !isActive && (
                          <div className="mt-1.5 h-0.5 w-full rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-orange-500/70"
                              style={{ width: `${Math.min(100, v.saved_progress)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {!locked && v.saved_progress >= 95 && (
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white/70' : 'text-green-500 dark:text-green-400'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : activeTab === 'pdfs' ? (
              <div className="p-3 space-y-1.5">
                {pdfs.length === 0 ? (
                  <EmptyState icon={FileText} text="لا توجد ملفات بعد" />
                ) : pdfs.map(p => {
                  const isActive = (activePdf || pdfs[0])?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setActivePdf(p); setActiveTab('pdfs'); }}
                      className={`w-full text-right flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-orange-500 shadow-lg shadow-orange-500/20'
                          : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-white/5'
                      }`}>
                        <FileText className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <p className={`flex-1 font-bold text-sm text-right truncate ${isActive ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {p.title}
                      </p>
                      {isActive && <Eye className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : activeTab === 'recitations' ? (
              <div className="p-3 space-y-2">
                {courseRecitations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-600">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-medium">لا توجد تسميعات</p>
                  </div>
                ) : courseRecitations.map(rec => {
                  const passed = isRecPassed(rec);
                  const hasResult = !!rec.result_id;
                  return (
                    <div key={rec.id} className={`rounded-xl p-3 border ${hasResult ? (passed ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5') : 'border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-gray-900 dark:text-white font-bold text-xs truncate flex-1">{rec.title}</p>
                        {hasResult ? (
                          <span className={`text-xs font-black flex-shrink-0 ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                            {rec.my_score}/{rec.total_score}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 flex-shrink-0">لم تُؤدَّ</span>
                        )}
                      </div>
                      {hasResult && (
                        <span className={`inline-block mt-1 text-xs font-bold px-1.5 py-0.5 rounded-full ${passed ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-500 dark:text-red-400'}`}>
                          {passed ? '✓ ناجح' : '✗ راسب'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile expand/collapse toggle — sits in the normal document flow
              so it never overlaps or overflows onto the PDF / recitation below. */}
          {canExpand && (
            <div className="md:hidden flex-shrink-0 flex justify-start px-3 py-1.5 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-white/10">
              <button
                onClick={() => setContentExpanded(e => !e)}
                className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:text-orange-500 dark:hover:text-orange-400 text-[11px] font-bold px-2.5 py-1.5 rounded-full active:scale-95 transition-all"
                title={contentExpanded ? 'إظهار القائمة' : 'تكبير الشاشة'}
              >
                {contentExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {contentExpanded ? 'إظهار القائمة' : 'تكبير الشاشة'}
              </button>
            </div>
          )}
          {activeTab === 'videos' ? (
            <>
              {/* Video area */}
              <div className="flex-1 bg-black overflow-hidden min-h-0">
                {/* key forces a CLEAN remount on every video switch — without it React
                    reuses the old player instance and the next video hangs (needs a full
                    page refresh). Both VideoPlayer/YoutubePlayer have proper cleanup
                    effects that flush progress before destruction. */}
                <VideoPlayer
                  key={currentVideo?.id}
                  video={currentVideo}
                  onProgressUpdate={handleProgressUpdate}
                  studentName={user?.name}
                  studentCode={user?.username}
                  initialPosition={getInitialPosition(currentVideo)}
                />
              </div>

              {/* Mobile compact title + next button */}
              {currentVideo && (
                <div className="md:hidden flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-white/10 px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-gray-900 dark:text-white font-bold text-sm truncate">{currentVideo.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {videos.findIndex(v => v.id === currentVideo.id) + 1} / {videos.length}
                      {currentVideo.duration_minutes > 0 && ` · ${fmt(currentVideo.duration_minutes)}`}
                    </p>
                  </div>
                  {(() => {
                    const idx = videos.findIndex(v => v.id === currentVideo.id);
                    const next = videos[idx + 1];
                    if (!next) return null;
                    const nextLocked = isVideoLocked(next, idx + 1);
                    return (
                      <button
                        onClick={() => {
                          // [H4-FIX] Mobile next button must also respect the lock state
                          if (nextLocked) {
                            toast.error('يجب اجتياز التسميع أولاً للوصول لهذه المحاضرة');
                            setActiveTab('recitations');
                            return;
                          }
                          setActiveVideo(next);
                        }}
                        className={`flex-shrink-0 flex items-center gap-1.5 text-white font-bold px-3 py-1.5 rounded-lg transition-all text-xs active:scale-95 ${
                          nextLocked ? 'bg-gray-600 opacity-60 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'
                        }`}
                      >
                        {nextLocked ? <Lock className="w-3 h-3" /> : null}
                        التالي <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    );
                  })()}
                </div>
              )}

              {/* Desktop full info bar */}
              {currentVideo && (
                <div className="hidden md:block flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-white/10 px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-gray-900 dark:text-white font-black text-lg leading-tight">
                        {currentVideo.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-1.5">
                        {currentVideo.duration_minutes > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            {fmt(currentVideo.duration_minutes)}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-600">
                          محاضرة {(videos.findIndex(v => v.id === currentVideo.id) + 1)} من {videos.length}
                        </span>
                      </div>
                    </div>

                    {/* Next video button */}
                    {(() => {
                      const idx = videos.findIndex(v => v.id === currentVideo.id);
                      const next = videos[idx + 1];
                      if (!next) return null;
                      const nextLocked = isVideoLocked(next, idx + 1);
                      return (
                        <button
                          onClick={() => {
                            if (nextLocked) {
                              toast.error('يجب اجتياز التسميع أولاً للوصول لهذه المحاضرة');
                              setActiveTab('recitations');
                              return;
                            }
                            setActiveVideo(next);
                          }}
                          className={`flex-shrink-0 flex items-center gap-2 font-bold px-4 py-2 rounded-xl transition-all text-sm active:scale-95 ${
                            nextLocked
                              ? 'bg-gray-600 opacity-60 cursor-not-allowed text-white'
                              : 'bg-orange-500 hover:bg-orange-600 text-white hover:shadow-lg'
                          }`}
                        >
                          {nextLocked ? <Lock className="w-4 h-4" /> : null}
                          التالي
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      );
                    })()}
                  </div>

                  {/* Playlist progress mini-strip */}
                  <div className="flex gap-1 mt-4">
                    {videos.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setActiveVideo(v)}
                        title={v.title}
                        className={`h-1 rounded-full flex-1 transition-all ${
                          v.id === currentVideo.id
                            ? 'bg-orange-500'
                            : 'bg-gray-300 dark:bg-white/10 hover:bg-gray-400 dark:hover:bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'pdfs' ? (
            <>
              {currentPdf && (
                <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-white/10 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-gray-900 dark:text-white font-black text-sm">{currentPdf.title}</p>
                      <p className="text-gray-500 text-xs">ملف PDF</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <Eye className="w-3.5 h-3.5" /> عرض فقط
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <PdfViewer key={currentPdf?.id} pdf={currentPdf} />
              </div>
            </>
          ) : null}
          {/* Recitations tab — always mounted so in-progress state survives tab switches */}
          <div className={activeTab === 'recitations' ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : 'hidden'}>
            <RecitationsTabPanel
              recitations={courseRecitations}
              courseId={courseId}
              onRefresh={() => refetchRecitations()}
              onPassed={() => { refetchRecitations(); }}
            />
          </div>
          {(activeTab !== 'recitations' && activeTab !== 'pdfs' && activeTab !== 'videos') && (
            /* Exams tab main area — shows grades breakdown */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-5">
                <h2 className="text-gray-900 dark:text-white font-black text-xl mb-4 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-purple-500 dark:text-purple-400" /> درجاتي في الاختبارات
                </h2>

                {exams.length === 0 ? (
                  <div className="text-center py-16 text-gray-500 dark:text-gray-600">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">لا توجد اختبارات بعد</p>
                  </div>
                ) : exams.map(ex => {
                  const myResult = examResults.find(r => String(r.exam_id) === String(ex.id));
                  const isAbsent = myResult && (myResult.is_absent === true || myResult.is_absent === 'true');
                  const passed = myResult && !isAbsent && myResult.score >= ex.pass_score;
                  const pct = myResult && !isAbsent ? Math.round((myResult.score / ex.total_score) * 100) : 0;
                  return (
                    <div key={ex.id} className={`bg-gray-50 dark:bg-white/5 rounded-2xl p-5 border ${
                      isAbsent ? 'border-gray-300 dark:border-gray-600/30'
                      : myResult ? (passed ? 'border-green-500/30' : 'border-red-500/30')
                      : 'border-gray-200 dark:border-white/10'
                    }`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-gray-900 dark:text-white font-bold text-sm">{ex.title}</h3>
                          <p className="text-gray-500 text-xs mt-0.5">{ex.total_score} درجة · حد النجاح {ex.pass_score}</p>
                        </div>
                        {isAbsent ? (
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-500/20 px-3 py-1.5 rounded-full">غائب</span>
                        ) : myResult ? (
                          <div className="text-left flex-shrink-0">
                            <div className={`text-2xl font-black ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {myResult.score}<span className="text-sm text-gray-500">/{ex.total_score}</span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-500 dark:text-red-400'}`}>
                              {passed ? '✓ ناجح' : '✗ راسب'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-white/5 px-3 py-1.5 rounded-full">لم تُؤدَّ بعد</span>
                        )}
                      </div>
                      {/* Score breakdown + review button: hidden for absent students */}
                      {myResult && !isAbsent && (
                        <>
                          <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-2 overflow-hidden mb-3">
                            <div className={`h-2 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-green-600 dark:text-green-400 font-bold">✓ صحيح: {myResult.correct_count}</span>
                            <span className="text-red-500 dark:text-red-400 font-bold">✗ خاطئ: {myResult.wrong_count}</span>
                            <span className="text-gray-500 font-bold">— متروك: {myResult.unanswered_count}</span>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => navigate(`/student/exam-review/${myResult.id}`)}
                              className="text-xs font-bold text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg transition-all"
                            >
                              مراجعة الاختبار
                            </button>
                          </div>
                        </>
                      )}
                      {!myResult && (
                        <button
                          onClick={() => navigate('/student/exams')}
                          className="text-xs font-bold text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg transition-all"
                        >
                          ابدأ الاختبار
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={() => navigate('/student/exams')}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-3 rounded-2xl transition-all"
                >
                  <BookOpen className="w-4 h-4" />
                  صفحة الاختبارات الكاملة
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="text-center py-16 text-gray-600">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}
