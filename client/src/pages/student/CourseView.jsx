import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Play, FileText, BookOpen, Video, Clock,
  Download, CheckCircle2, Lock, ChevronRight, AlertCircle,
  Pause, Volume2, VolumeX, Maximize2, Minimize2, RotateCcw, RotateCw,
  Settings, Gauge, CheckCircle, XCircle, RefreshCw, Trophy, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { withToken } from '../../lib/mediaAccess';

/* ─── helpers ─────────────────────────────────────────── */
const fmt = (min) => min >= 60
  ? `${Math.floor(min / 60)}س ${min % 60}د`
  : `${min} دقيقة`;

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
        opacity: visible ? 0.45 : 0,
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
      {[0, 1, 2].map(i => (
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
  if (_ytApiReady && window.YT?.Player) { cb(); return; }
  _ytApiQueue.push(cb);
  if (!document.getElementById('yt-api-script')) {
    const s = document.createElement('script');
    s.id = 'yt-api-script';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
  const prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (prevReady) prevReady();
    _ytApiReady = true;
    _ytApiQueue.forEach(fn => fn());
    _ytApiQueue.length = 0;
  };
}

/* ─── Custom YouTube Player (IFrame API) ───────────────── */
function YoutubePlayer({ video, onProgressUpdate, studentName, studentCode, initialPosition = 0 }) {
  const containerRef  = useRef(null);
  const playerRef     = useRef(null);
  const playerDivId   = useRef(`yt-${Math.random().toString(36).slice(2)}`).current;
  const progressTimer = useRef(null);
  const saveTimer     = useRef(null);
  const hideTimer     = useRef(null);
  const seeking       = useRef(false);
  const maxPct        = useRef(0);
  const actualWatched = useRef(0);
  const playStart     = useRef(null);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const videoIdRef          = useRef(video?.id);

  const [playing,      setPlaying]      = useState(false);
  const [buffering,    setBuffering]    = useState(true);
  const [initialLoad,  setInitialLoad]  = useState(true);
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

  const ytId = extractYoutubeId(video.file_path_or_url);

  /* ── keep prop refs current ── */
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
  useEffect(() => { videoIdRef.current = video?.id; }, [video?.id]);

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
    return () => {
      flushYTProgress();
    };
  }, [video?.id]); // eslint-disable-line

  useEffect(() => {
    setPlaying(false);
    setBuffering(true);
    setInitialLoad(true);
    setProgress(0);
    setCurrentTime(0);
    maxPct.current = 0;
    actualWatched.current = 0;
    playStart.current = null;
  }, [video?.id]);

  /* ── fullscreen change listener ── */
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(fs);
      if (!fs) setCssFullscreen(false);
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

  /* ── initialise / destroy player ── */
  useEffect(() => {
    if (!ytId) return;

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
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          cc_load_policy: 0,
          start: initialPosition > 5 ? Math.floor(initialPosition) : 0,
        },
        events: {
          onReady: (e) => {
            setBuffering(false);
            const d = e.target.getDuration();
            if (d > 0) setDuration(d);
            e.target.setVolume(savedVol);
            if (loadMuted()) { try { e.target.mute(); } catch (_) {} }
            try { e.target.setPlaybackRate(savedSpeed); } catch (_) {}
            if (initialPosition > 5) {
              try { e.target.seekTo(initialPosition, true); } catch (_) {}
            }
          },
          onStateChange: (e) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) {
              setPlaying(true);
              setBuffering(false);
              setInitialLoad(false);
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
              /* UNSTARTED / CUED — autoplay blocked or video cued but not playing yet.
                 Clear the loading state so the play button becomes visible. */
              setBuffering(false);
              setInitialLoad(false);
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
              if (e.data === S.ENDED) {
                setProgress(100);
                if (onProgressUpdate && video?.id) {
                  const dur = playerRef.current?.getDuration() || 0;
                  saveVidPos(video.id, dur);
                  onProgressUpdate(video.id, dur / 60, 100, true, dur, actualWatched.current);
                }
              } else if (e.data === S.PAUSED) {
                if (onProgressUpdate && video?.id) {
                  try {
                    const dur = playerRef.current?.getDuration() || 0;
                    const ct  = playerRef.current?.getCurrentTime() || 0;
                    const watchedMin = dur > 0 ? (maxPct.current / 100) * (dur / 60) : 0;
                    saveVidPos(video.id, ct);
                    onProgressUpdate(video.id, watchedMin, maxPct.current, false, ct, actualWatched.current);
                  } catch (_) {}
                }
              }
            }
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
    playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
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

  const rewind10 = () => {
    try {
      const t = Math.max(0, (playerRef.current?.getCurrentTime() || 0) - 10);
      playerRef.current?.seekTo(t, true);
      setCurrentTime(t);
    } catch (_) {}
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    saveSpeed(s);
    setShowSpeed(false);
    try { playerRef.current?.setPlaybackRate(s); } catch (_) {}
  };

  const toggleLandscape = () => {
    if (cssLandscape) {
      setCssLandscape(false);
      setIsFullscreen(false);
    } else {
      setCssFullscreen(false);
      setCssLandscape(true);
      setIsFullscreen(true);
    }
  };

  const toggleFullscreen = () => {
    const inNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (inNativeFs || cssFullscreen || cssLandscape) {
      if (inNativeFs) {
        try { (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document); } catch (_) {}
      }
      try { screen.orientation?.unlock?.(); } catch (_) {}
      setCssFullscreen(false);
      setCssLandscape(false);
      setIsFullscreen(false);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fsReq) {
      fsReq.call(el)
        .then(() => {
          try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}
        })
        .catch(() => {
          setCssLandscape(true);
          setIsFullscreen(true);
        });
    } else {
      setCssLandscape(true);
      setIsFullscreen(true);
    }
  };

  const resetHide = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!seeking.current) setShowControls(false);
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

  const pct = `${progress}%`;
  const vol = `${muted ? 0 : volume}%`;

  const fsStyle = cssLandscape ? {
    position: 'fixed', top: 0, left: 0,
    width: '100vh', height: '100vw',
    transformOrigin: 'top left',
    transform: 'rotate(-90deg) translateX(-100%)',
    zIndex: 9999,
  } : cssFullscreen ? {
    position: 'fixed', inset: 0, zIndex: 9998,
    width: '100vw', height: '100vh',
  } : {};

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

      {/* YouTube iframe — full size */}
      <div
        id={playerDivId}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />

      {/* Permanent black bar — covers YouTube title + channel name at top
          Mobile: 40px (fits within letterbox on small screens)
          Desktop: 72px (more conservative for large viewports) */}
      <div
        className="absolute top-0 left-0 right-0 bg-black h-10 md:h-[72px]"
        style={{ zIndex: 13, pointerEvents: 'none' }}
      />

      {/* Permanent black bar — covers YouTube logo at bottom
          Mobile: 28px  Desktop: 52px */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-black h-7 md:h-[52px]"
        style={{ zIndex: 13, pointerEvents: 'none' }}
      />

      {/* Overlay strategy:
          - initialLoad (before first play) → full black to hide blank iframe
          - After first play starts → transparent forever, even on pause/re-buffer
            so the last video frame always stays visible with no blackout */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          zIndex: 11,
          opacity: initialLoad ? 1 : 0,
          transition: initialLoad ? 'opacity 0.15s ease-out' : 'opacity 2s ease-in',
          pointerEvents: 'none',
        }}
      />

      {/* Click interceptor — sits above overlay, handles focus-in/out taps */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 12 }}
        onClick={handleScreenTap}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Play button — visible when paused and not buffering */}
      {!playing && !buffering && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20, pointerEvents: 'none' }}>
          <div
            className="w-20 h-20 rounded-full bg-orange-500/90 flex items-center justify-center shadow-2xl hover:scale-110 transition-transform cursor-pointer"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            <Play className="w-8 h-8 text-white fill-white mr-[-2px]" />
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20, pointerEvents: 'none' }}>
          <div className="w-12 h-12 border-4 border-white/20 border-t-orange-500 rounded-full animate-spin" />
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

      <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ zIndex: 30 }}>
        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pt-10 pb-3">
          <div className="mb-3">
            <input type="range" min="0" max="100" step="0.1" value={progress} dir="ltr"
              className="player-range player-range-progress" style={{ '--pct': pct }}
              onMouseDown={() => { seeking.current = true; }}
              onMouseUp={() => { seeking.current = false; resetHide(); }}
              onTouchStart={() => { seeking.current = true; resetHide(); }}
              onTouchEnd={() => { seeking.current = false; resetHide(); }}
              onChange={onSeekChange} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            </button>
            <button onClick={rewind10} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
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
              <input type="range" min="0" max="100" step="1" value={muted ? 0 : volume} dir="ltr"
                className="player-range player-range-volume" style={{ '--vol': vol }}
                onChange={onVolumeChange} />
            </div>
            {/* زر تدوير الشاشة — يظهر على الموبايل فقط */}
            <button
              onClick={toggleLandscape}
              className={`sm:hidden transition-colors flex-shrink-0 ${cssLandscape ? 'text-orange-400' : 'text-white hover:text-orange-400'}`}
              title="تدوير الشاشة"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
      if (!fs) setCssFullscreen(false);
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
    if (playing) videoRef.current.pause();
    else         videoRef.current.play();
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

  const toggleLandscape = () => {
    if (cssLandscape) {
      setCssLandscape(false);
      setIsFullscreen(false);
    } else {
      setCssFullscreen(false);
      setCssLandscape(true);
      setIsFullscreen(true);
    }
  };

  const toggleFullscreen = () => {
    const inNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (inNativeFs || cssFullscreen || cssLandscape) {
      if (inNativeFs) {
        try { (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document); } catch (_) {}
      }
      try { screen.orientation?.unlock?.(); } catch (_) {}
      setCssFullscreen(false);
      setCssLandscape(false);
      setIsFullscreen(false);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fsReq) {
      fsReq.call(el)
        .then(() => {
          try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}
        })
        .catch(() => {
          if (videoRef.current?.webkitEnterFullscreen) {
            videoRef.current.webkitEnterFullscreen();
          } else {
            setCssLandscape(true);
            setIsFullscreen(true);
          }
        });
    } else if (videoRef.current?.webkitEnterFullscreen) {
      videoRef.current.webkitEnterFullscreen();
    } else {
      setCssLandscape(true);
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

  if (isYoutubeUrl(video.file_path_or_url)) {
    return <YoutubePlayer video={video} onProgressUpdate={onProgressUpdate} studentName={studentName} studentCode={studentCode} initialPosition={initialPosition} />;
  }

  const currentSrc = video.file_path_or_url;

  const pct = `${progress}%`;
  const vol = `${(muted ? 0 : volume) * 100}%`;

  const vFsStyle = cssLandscape ? {
    position: 'fixed', top: 0, left: 0,
    width: '100vh', height: '100vw',
    transformOrigin: 'top left',
    transform: 'rotate(-90deg) translateX(-100%)',
    zIndex: 9999,
  } : cssFullscreen ? {
    position: 'fixed', inset: 0, zIndex: 9998,
    width: '100vw', height: '100vh',
  } : {};

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

      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
          <div className="w-20 h-20 rounded-full bg-orange-500/90 flex items-center justify-center shadow-2xl hover:scale-110 transition-all" style={{ pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); toggle(); }}>
            <Play className="w-8 h-8 text-white fill-white mr-[-2px]" />
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
              className={`sm:hidden transition-colors flex-shrink-0 ${cssLandscape ? 'text-orange-400' : 'text-white hover:text-orange-400'}`}
              title="تدوير الشاشة"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PDF Viewer ───────────────────────────────────────── */
function PdfViewer({ pdf }) {
  if (!pdf) return (
    <div className="w-full h-full flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-400">
        <FileText className="w-20 h-20 mx-auto mb-4 opacity-20" />
        <p className="font-semibold text-lg">اختر ملفاً للعرض</p>
      </div>
    </div>
  );

  const pdfSrc = withToken(pdf.file_url);

  return (
    <div className="flex flex-col w-full h-full bg-gray-100">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="font-bold text-sm text-gray-800 truncate">{pdf.title}</span>
        </div>
        <a
          href={pdfSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> فتح في تاب جديد
        </a>
      </div>
      <div className="flex-1 overflow-hidden">
        <object
          key={pdf.id}
          data={pdfSrc}
          type="application/pdf"
          className="w-full h-full"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <div className="text-center p-8 max-w-sm">
              <div className="w-20 h-20 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-5">
                <FileText className="w-10 h-10 text-orange-500" />
              </div>
              <p className="font-black text-gray-800 text-xl mb-2">{pdf.title}</p>
              <p className="text-gray-400 text-sm mb-6">اضغط الزر أدناه لفتح الملف</p>
              <a
                href={pdfSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-all hover:shadow-lg active:scale-95"
              >
                <Download className="w-4 h-4" /> فتح الملف
              </a>
            </div>
          </div>
        </object>
      </div>
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
  // [H1-FIX] Removed stale dark-mode read — component uses hardcoded dark-themed colors

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

  const timerRef = useRef(null);
  const timerEpochRef = useRef(null);
  const timerDurationRef = useRef(null);
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);
  const handleSubmitRef = useRef(null); // [H3-FIX] always-current ref, prevents stale closure in timer

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

  // Drift-corrected server timer
  useEffect(() => {
    if (view !== 'take' || timeLeft === null) return;
    // [H3-FIX] Use ref to avoid stale closure — handleSubmitRef.current is always the latest handleSubmit
    if (timeLeft <= 0) { handleSubmitRef.current?.(true); return; }
    timerRef.current = setTimeout(() => {
      if (timerEpochRef.current !== null && timerDurationRef.current !== null) {
        const elapsed = Date.now() - timerEpochRef.current;
        const trueLeft = Math.max(0, Math.floor((timerDurationRef.current - elapsed) / 1000));
        setTimeLeft(trueLeft);
      } else {
        setTimeLeft(t => Math.max(0, t - 1));
      }
    }, 1000);
    return () => clearTimeout(timerRef.current);
  }, [view, timeLeft]);

  // Save answers to localStorage
  useEffect(() => {
    if (view === 'take' && selectedRec) {
      localStorage.setItem(`recitation_answers_${selectedRec.id}`, JSON.stringify(answers));
    }
  }, [answers, view, selectedRec]);

  // Cleanup saved answers on unmount if submitted
  useEffect(() => {
    return () => {
      if (submittedRef.current && selectedRec?.id) {
        localStorage.removeItem(`recitation_answers_${selectedRec.id}`);
      }
      submittedRef.current = false;
    };
  }, [selectedRec]);

  // Keepalive on tab close
  useEffect(() => {
    if (view !== 'take' || !selectedRec) return;
    const handleUnload = () => {
      if (submittedRef.current) return;
      const token = localStorage.getItem('wathba_token');
      const tenantSlug = localStorage.getItem('wathba_teacher_slug') || '';
      const qs2 = examData?.questions || [];
      const payloadUnload = JSON.stringify({
        answers: qs2.map(q => ({
          question_id: q.id,
          answer: q.question_type === 'image_multi'
            ? JSON.stringify(answers[q.id] || {})
            : (answers[q.id] || null),
        }))
      });
      fetch(`/api/recitations/${selectedRec.id}/submit`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
        },
        body: payloadUnload,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [view, selectedRec, answers, examData]);

  const startRec = async (rec) => {
    if (startingId) return; // [M3-FIX] prevent double-start across all recs
    setStartingId(rec.id);
    submittedRef.current = false;
    try {
      const { data } = await api.get(`/recitations/${rec.id}/take`);
      setExamData(data);
      setSelectedRec(rec);
      // [H2-FIX] Guard against corrupted localStorage JSON (e.g. after a browser crash)
      let restoredAnswers = {};
      const saved = localStorage.getItem(`recitation_answers_${rec.id}`);
      if (saved) {
        try { restoredAnswers = JSON.parse(saved); }
        catch { localStorage.removeItem(`recitation_answers_${rec.id}`); }
      }
      setAnswers(restoredAnswers);
      const startedAt = new Date(data.server_started_at).getTime();
      const durationMs = rec.duration_minutes * 60 * 1000;
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      timerEpochRef.current = startedAt;
      timerDurationRef.current = durationMs;
      setTimeLeft(Math.floor(remaining / 1000));
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
      localStorage.removeItem(`recitation_answers_${selectedRec.id}`);
      setResult(data);
      setView('result');
      qc.invalidateQueries(['course-recitations', courseId]);
      qc.invalidateQueries(['student-recitations']);
      // [M4-FIX] If the student just passed, notify parent to switch to videos tab
      if (data.passed) onPassed?.();
    } catch (e) {
      if (!mountedRef.current) return;
      submittedRef.current = false;
      setSubmitting(false);
      const errData = e.response?.data || {};
      if (errData.already_submitted) {
        toast('تم تسليم التسميع بالفعل', { icon: 'ℹ️' });
        localStorage.removeItem(`recitation_answers_${selectedRec?.id}`);
        setView('list');
        qc.invalidateQueries(['course-recitations', courseId]);
      } else if (errData.timer_expired) {
        toast.error('انتهى وقت التسميع');
        localStorage.removeItem(`recitation_answers_${selectedRec?.id}`);
        setView('list');
        qc.invalidateQueries(['course-recitations', courseId]);
      } else {
        toast.error(errData.error || 'حدث خطأ أثناء التسليم');
      }
    }
  }, [examData, answers, selectedRec, submitting, qc, courseId, onPassed]);

  // [H3-FIX] Keep handleSubmitRef always pointing to the latest handleSubmit.
  // Assigned in render so the timer effect never captures a stale closure.
  handleSubmitRef.current = handleSubmit;

  const backToList = () => {
    setView('list');
    setResult(null);
    setExamData(null);
    submittedRef.current = false;
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

    return (
      <div className="flex flex-col h-full overflow-hidden" dir="rtl">
        {/* Timer bar */}
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-white text-xs font-black truncate max-w-[140px]">{selectedRec?.title}</p>
            <p className="text-gray-500 text-[10px]">{answered}/{questions.length} إجابة</p>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-sm tabular-nums ${
            urgent ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-purple-500/10 text-purple-400'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {mins}:{String(secs).padStart(2, '0')}
          </div>
        </div>
        {/* Questions scroll area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {questions.map((q, idx) => (
            <SidebarQuestionCard key={q.id} q={q} idx={idx} answers={answers} setAnswers={setAnswers} />
          ))}
          <button
            onClick={() => {
              if (window.confirm(`هل أنت متأكد من تسليم التسميع؟\nأجبت على ${answered} من ${questions.length} أسئلة`)) {
                handleSubmit(false);
              }
            }}
            disabled={submitting}
            className="w-full py-3 rounded-2xl font-black text-sm text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-60 transition-colors mt-2">
            {submitting ? <><RefreshCw className="w-4 h-4 inline ml-1.5 animate-spin" />جاري التسليم...</> : 'تسليم التسميع'}
          </button>
        </div>
      </div>
    );
  }

  // ── RESULT VIEW ──
  if (view === 'result' && result) {
    const { score, correct, wrong, unanswered, passed, points_earned, total_score, pass_score } = result;
    return (
      <div className="flex flex-col h-full overflow-y-auto p-3 space-y-3" dir="rtl">
        <div className={`rounded-2xl p-4 text-center ${passed ? 'bg-gradient-to-br from-green-600 to-emerald-700' : 'bg-gradient-to-br from-red-600 to-rose-700'} text-white`}>
          <div className="text-4xl mb-1">{passed ? '🎉' : '📚'}</div>
          <div className="text-3xl font-black">{score}<span className="text-base font-semibold opacity-70">/{total_score}</span></div>
          <p className="text-sm font-bold mt-1">{passed ? 'نجحت! ✓' : 'لم تنجح'}</p>
          <p className="text-white/70 text-xs mt-0.5">حد النجاح: {pass_score}/{total_score}</p>
          {points_earned > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5 text-xs font-black">
              <Trophy className="w-3.5 h-3.5" /> +{points_earned} نقطة
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['✅', 'صحيح', correct, 'text-green-400'], ['❌', 'خطأ', wrong, 'text-red-400'], ['⬜', 'بلا إجابة', unanswered, 'text-gray-400']].map(([icon, label, val, cls]) => (
            <div key={label} className="bg-white/5 rounded-xl p-2.5 text-center border border-white/10">
              <div className="text-lg">{icon}</div>
              <div className={`text-lg font-black ${cls}`}>{val}</div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>
        {result?.result?.id && (
          <button
            onClick={() => navigate(`/student/recitation-review/${result.result.id}`)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-indigo-500/30"
          >
            <Eye className="w-3.5 h-3.5" /> مراجعة مفصّلة
          </button>
        )}
        {!passed && (
          <button onClick={() => startRec(selectedRec)}
            className="w-full flex items-center justify-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-purple-500/30">
            <RefreshCw className="w-3.5 h-3.5" /> أعد المحاولة
          </button>
        )}
        <button onClick={backToList}
          className="w-full py-2.5 rounded-xl font-bold text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
          العودة للقائمة →
        </button>
      </div>
    );
  }

  // [M1-FIX] Determine schedule status for each recitation
  const getRecStatus = (rec) => {
    const now = new Date();
    if (rec.start_date && new Date(rec.start_date) > now) return 'upcoming';
    if (rec.end_date && new Date(rec.end_date) < now) return 'expired';
    return 'open';
  };

  // ── LIST VIEW ──
  if (recitations.length === 0) {
    return (
      <div className="flex flex-col h-full" dir="rtl">
        <div className="flex flex-col items-center justify-center flex-1 min-h-[180px] p-4 text-center">
          <BookOpen className="w-10 h-10 text-gray-700 mb-2" />
          <p className="text-gray-600 text-sm font-semibold">لا توجد تسميعات مرتبطة بهذا الكورس</p>
        </div>
        {/* [C2-FIX] Link to standalone recitations so students can still access non-course-linked ones */}
        <div className="px-3 pb-3 border-t border-white/10 pt-3 flex-shrink-0">
          <button
            onClick={() => navigate('/student/recitations')}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-gray-500 hover:text-purple-400 hover:bg-purple-500/5 transition-colors border border-white/5">
            <BookOpen className="w-3.5 h-3.5" /> كل التسميعات (مستقلة)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {recitations.map(rec => {
          const hasResult = !!rec.result_id;
          const passed = rec.my_passed;
          const status = getRecStatus(rec); // [M1-FIX]
          const isExpired = status === 'expired';
          const isUpcoming = status === 'upcoming';
          const canStart = !passed && !isExpired && !isUpcoming;
          return (
            <div key={rec.id} className={`rounded-xl border p-3 transition-all ${
              passed
                ? 'border-green-500/30 bg-green-500/5'
                : hasResult
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-white/10 bg-white/5'
            }`}>
              <div className="flex items-start gap-2.5 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  passed ? 'bg-green-500/20' : hasResult ? 'bg-red-500/20' : 'bg-purple-500/10'
                }`}>
                  {passed ? <CheckCircle className="w-4 h-4 text-green-400" /> :
                   hasResult ? <XCircle className="w-4 h-4 text-red-400" /> :
                   <BookOpen className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold truncate">{rec.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-gray-500">
                      <Clock className="w-2.5 h-2.5 inline ml-0.5" />{rec.duration_minutes} دقيقة
                    </span>
                    <span className="text-[10px] text-gray-500">{rec.question_count} سؤال</span>
                    {hasResult && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {rec.my_score}/{rec.total_score} · {passed ? 'ناجح ✓' : 'راسب ✗'}
                      </span>
                    )}
                    {/* [M1-FIX] Schedule status badges */}
                    {isExpired && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400">
                        انتهى الوقت
                      </span>
                    )}
                    {isUpcoming && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                        لم يبدأ بعد
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {canStart && (
                  <button
                    onClick={() => startRec(rec)}
                    disabled={startingId === rec.id} // [M3-FIX] only disable the specific rec
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-black text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-60 transition-colors">
                    {startingId === rec.id ? ( // [M3-FIX]
                      <RefreshCw className="w-3 h-3 inline animate-spin" />
                    ) : hasResult ? 'أعد المحاولة' : 'ابدأ التسميع'}
                  </button>
                )}
                {rec.result_id && (
                  <button
                    onClick={() => navigate(`/student/recitation-review/${rec.result_id}`)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors border border-indigo-500/20">
                    <Eye className="w-3 h-3 inline ml-0.5" />مراجعة
                  </button>
                )}
                {passed && (
                  <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold text-green-400 bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-3 h-3" /> اجتزت التسميع
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* [C2-FIX] Link to standalone recitations so students can still access non-course-linked ones */}
      <div className="px-3 pb-3 border-t border-white/10 pt-2 flex-shrink-0">
        <button
          onClick={() => navigate('/student/recitations')}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-gray-500 hover:text-purple-400 hover:bg-purple-500/5 transition-colors border border-white/5">
          <BookOpen className="w-3.5 h-3.5" /> كل التسميعات (مستقلة)
        </button>
      </div>
    </div>
  );
}

function SidebarQuestionCard({ q, idx, answers, setAnswers }) {
  const options = [
    q.option_a && { letter: 'A', text: q.option_a },
    q.option_b && { letter: 'B', text: q.option_b },
    q.option_c && { letter: 'C', text: q.option_c },
    q.option_d && { letter: 'D', text: q.option_d },
  ].filter(Boolean);

  const isImgMulti = q.question_type === 'image_multi';
  const selected = answers[q.id];
  const subAnswers = isImgMulti ? (selected || {}) : {};
  const hasAny = isImgMulti ? Object.keys(subAnswers).length > 0 : !!selected;

  return (
    <div className={`rounded-xl p-3 border transition-all ${hasAny ? 'border-purple-500/40 bg-purple-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-start gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">{idx + 1}</span>
        {q.question_text && (
          <p className="text-gray-200 text-xs font-semibold flex-1">{q.question_text}</p>
        )}
      </div>
      {q.question_image_url && (
        <img src={q.question_image_url} alt="question" className="w-full max-h-32 object-contain rounded-lg border border-white/10 mb-2" />
      )}
      {isImgMulti ? (
        <div className="space-y-1.5">
          {options.some(o => o.text !== o.letter) && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {options.map(({ letter, text }) => (
                <span key={letter} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400">{letter}: {text}</span>
              ))}
            </div>
          )}
          {(q.sub_questions || []).map(sub => {
            const subSel = subAnswers[sub.label];
            return (
              <div key={sub.label} className="rounded-lg p-2 bg-white/5 border border-white/10">
                <p className="text-[10px] font-bold text-gray-300 mb-1">البند {sub.label}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {options.map(({ letter }) => (
                    <button key={letter}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [sub.label]: letter } }))}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        subSel === letter
                          ? 'bg-purple-500 text-white border-purple-500'
                          : 'bg-white/5 border-white/20 text-gray-300 hover:border-purple-400'
                      }`}>
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1.5">
          {options.map(({ letter, text }) => (
            <button key={letter}
              onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
              className={`w-full text-right flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                selected === letter
                  ? 'bg-purple-500 text-white border-purple-500'
                  : 'bg-white/5 border-white/15 text-gray-300 hover:border-purple-400'
              }`}>
              <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 ${selected === letter ? 'bg-white/20' : 'bg-white/10 text-purple-400'}`}>{letter}</span>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
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
    return Math.max(serverPos, localPos);
  };

  // Keep a ref to latest content so auto-advance in handleProgressUpdate always uses current data
  const contentRef = useRef(null);
  // Keep a ref to latest courseRecitations so auto-advance respects lock state
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
            return vids.includes(next.id) && !rec.my_passed;
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
  });

  const { data: courseRecitations = [], refetch: refetchRecitations } = useQuery({
    queryKey: ['course-recitations', courseId],
    queryFn: () => api.get(`/recitations/student/course/${courseId}`).then(r => r.data),
    enabled: !!courseId && !coursesLoading,
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
  ── */
  const isVideoLocked = useCallback((video, videoIndex) => {
    if (videoIndex === 0) return false;
    // Use server-provided flag if available
    if (typeof video.is_locked === 'boolean') return video.is_locked;
    // Fallback for teacher preview (server does not set is_locked for non-students)
    return courseRecitations.some(rec => {
      const vids = Array.isArray(rec.video_ids) ? rec.video_ids.map(Number) : [];
      return vids.includes(video.id) && !rec.my_passed;
    });
  }, [courseRecitations]);

  const currentVideo = activeVideo || videos[0] || null;
  const currentPdf = activePdf || pdfs[0] || null;

  const tabs = [
    { key: 'videos', label: 'المحاضرات', icon: Video, count: videos.length },
    { key: 'pdfs', label: 'الملفات', icon: FileText, count: pdfs.length },
    { key: 'recitations', label: 'التسميع', icon: BookOpen, count: courseRecitations.length },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-950">

      {/* ── Breadcrumb Header ── */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-white/10 px-5 py-3 flex items-center gap-3 z-10">
        <button
          onClick={() => navigate('/student/courses')}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-orange-400 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>كورساتي</span>
        </button>
        <ChevronRight className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-black text-white truncate">{course?.name || '…'}</span>

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
        <aside className="w-full h-[34vh] md:w-80 md:h-auto flex-shrink-0 bg-gray-900 border-t md:border-t-0 md:border-l border-white/10 flex flex-col overflow-hidden">

          {/* Course info strip — desktop only */}
          <div className="hidden md:block flex-shrink-0 px-4 py-4 border-b border-white/10 bg-gradient-to-b from-orange-500/10 to-transparent">
            <p className="text-white font-black text-sm leading-relaxed line-clamp-2">{course?.name}</p>
            {course?.target_stage && (
              <span className="mt-1.5 inline-block text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                {course.target_stage}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b border-white/10">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-bold transition-all border-b-2 ${
                  activeTab === tab.key
                    ? 'text-orange-400 border-orange-400 bg-orange-400/5'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-black leading-none ${
                  activeTab === tab.key ? 'bg-orange-400/20 text-orange-300' : 'bg-white/5 text-gray-500'
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
                  <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
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
                          : 'hover:bg-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${
                        locked ? 'bg-white/5 text-gray-600'
                          : isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-500'
                      }`}>
                        {locked
                          ? <Lock className="w-4 h-4" />
                          : isActive
                          ? <Play className="w-4 h-4 text-white fill-white" />
                          : <span>{i + 1}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm truncate ${isActive ? 'text-white' : locked ? 'text-gray-600' : 'text-gray-300'}`}>
                          {v.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {locked && (
                            <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">
                              🔒 يتطلب تسميع
                            </span>
                          )}
                          {!locked && v.duration_minutes > 0 && (
                            <p className={`text-xs flex items-center gap-1 ${isActive ? 'text-white/60' : 'text-gray-600'}`}>
                              <Clock className="w-3 h-3" /> {fmt(v.duration_minutes)}
                            </p>
                          )}
                          {!locked && v.saved_progress > 0 && (
                            <span className={`text-[10px] font-bold ${isActive ? 'text-white/70' : 'text-orange-400'}`}>
                              {Math.round(v.saved_progress)}%
                            </span>
                          )}
                        </div>
                        {!locked && v.saved_progress > 0 && !isActive && (
                          <div className="mt-1.5 h-0.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-orange-500/70"
                              style={{ width: `${Math.min(100, v.saved_progress)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {!locked && v.saved_progress >= 95 && (
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white/70' : 'text-green-400'}`} />
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
                          : 'hover:bg-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-white/20' : 'bg-white/5'
                      }`}>
                        <FileText className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <p className={`flex-1 font-bold text-sm text-right truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
                        {p.title}
                      </p>
                      {isActive && <Download className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : activeTab === 'recitations' ? (
              <RecitationsTabPanel
                recitations={courseRecitations}
                courseId={courseId}
                onRefresh={() => refetchRecitations()}
                onPassed={() => { refetchRecitations(); setActiveTab('videos'); }} // [M4-FIX] auto-switch to videos after passing
              />
            ) : null}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'videos' ? (
            <>
              {/* Video area */}
              <div className="flex-1 bg-black overflow-hidden min-h-0">
                <VideoPlayer
                  video={currentVideo}
                  onProgressUpdate={handleProgressUpdate}
                  studentName={user?.name}
                  studentCode={user?.username}
                  initialPosition={getInitialPosition(currentVideo)}
                />
              </div>

              {/* Mobile compact title + next button */}
              {currentVideo && (
                <div className="md:hidden flex-shrink-0 bg-gray-900 border-t border-white/10 px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{currentVideo.title}</p>
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
                <div className="hidden md:block flex-shrink-0 bg-gray-900 border-t border-white/10 px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-white font-black text-lg leading-tight">
                        {currentVideo.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-1.5">
                        {currentVideo.duration_minutes > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            {fmt(currentVideo.duration_minutes)}
                          </span>
                        )}
                        <span className="text-xs text-gray-600">
                          محاضرة {(videos.findIndex(v => v.id === currentVideo.id) + 1)} من {videos.length}
                        </span>
                      </div>
                    </div>

                    {/* Next video button */}
                    {(() => {
                      const idx = videos.findIndex(v => v.id === currentVideo.id);
                      const next = videos[idx + 1];
                      return next ? (
                        <button
                          onClick={() => setActiveVideo(next)}
                          className="flex-shrink-0 flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl transition-all text-sm hover:shadow-lg active:scale-95"
                        >
                          التالي
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      ) : null;
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
                            : 'bg-white/10 hover:bg-white/20'
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
                <div className="flex-shrink-0 bg-gray-900 border-b border-white/10 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-white font-black text-sm">{currentPdf.title}</p>
                      <p className="text-gray-500 text-xs">ملف PDF</p>
                    </div>
                  </div>
                  <a
                    href={withToken(currentPdf.file_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-300 bg-orange-400/10 hover:bg-orange-400/20 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> تحميل
                  </a>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <PdfViewer key={currentPdf?.id} pdf={currentPdf} />
              </div>
            </>
          ) : activeTab === 'recitations' ? (
            /* Recitations tab main area */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-5">
                <h2 className="text-white font-black text-xl mb-4 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-purple-400" /> درجاتي في التسميعات
                </h2>

                {courseRecitations.length === 0 ? (
                  <div className="text-center py-16 text-gray-600">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">لا توجد تسميعات مرتبطة بهذا الكورس</p>
                  </div>
                ) : courseRecitations.map(rec => {
                  const passed = rec.my_passed;
                  const hasResult = !!rec.result_id;
                  const pct = hasResult ? Math.round((rec.my_score / rec.total_score) * 100) : 0;
                  return (
                    <div key={rec.id} className={`bg-white/5 rounded-2xl p-5 border ${hasResult ? (passed ? 'border-green-500/30' : 'border-red-500/30') : 'border-white/10'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-white font-bold text-sm">{rec.title}</h3>
                          <p className="text-gray-500 text-xs mt-0.5">{rec.total_score} درجة · {rec.question_count} سؤال · {rec.duration_minutes} دقيقة</p>
                        </div>
                        {hasResult ? (
                          <div className="text-left flex-shrink-0">
                            <div className={`text-2xl font-black ${passed ? 'text-green-400' : 'text-red-400'}`}>
                              {rec.my_score}<span className="text-sm text-gray-500">/{rec.total_score}</span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {passed ? '✓ ناجح' : '✗ راسب'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-500 bg-white/5 px-3 py-1.5 rounded-full">لم تُؤدَّ بعد</span>
                        )}
                      </div>
                      {hasResult && (
                        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={() => navigate('/student/recitations')}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-black px-6 py-3 rounded-2xl transition-all"
                >
                  <BookOpen className="w-4 h-4" />
                  صفحة التسميعات الكاملة
                </button>
              </div>
            </div>
          ) : (
            /* Exams tab main area — shows grades breakdown */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-5">
                <h2 className="text-white font-black text-xl mb-4 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-purple-400" /> درجاتي في الاختبارات
                </h2>

                {exams.length === 0 ? (
                  <div className="text-center py-16 text-gray-600">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">لا توجد اختبارات بعد</p>
                  </div>
                ) : exams.map(ex => {
                  const myResult = examResults.find(r => String(r.exam_id) === String(ex.id));
                  const passed = myResult && myResult.score >= ex.pass_score;
                  const pct = myResult ? Math.round((myResult.score / ex.total_score) * 100) : 0;
                  return (
                    <div key={ex.id} className={`bg-white/5 rounded-2xl p-5 border ${myResult ? (passed ? 'border-green-500/30' : 'border-red-500/30') : 'border-white/10'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-white font-bold text-sm">{ex.title}</h3>
                          <p className="text-gray-500 text-xs mt-0.5">{ex.total_score} درجة · حد النجاح {ex.pass_score}</p>
                        </div>
                        {myResult ? (
                          <div className="text-left flex-shrink-0">
                            <div className={`text-2xl font-black ${passed ? 'text-green-400' : 'text-red-400'}`}>
                              {myResult.score}<span className="text-sm text-gray-500">/{ex.total_score}</span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {passed ? '✓ ناجح' : '✗ راسب'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-500 bg-white/5 px-3 py-1.5 rounded-full">لم تُؤدَّ بعد</span>
                        )}
                      </div>
                      {myResult && (
                        <>
                          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden mb-3">
                            <div className={`h-2 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-green-400 font-bold">✓ صحيح: {myResult.correct_count}</span>
                            <span className="text-red-400 font-bold">✗ خاطئ: {myResult.wrong_count}</span>
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
