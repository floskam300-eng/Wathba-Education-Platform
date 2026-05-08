import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Play, FileText, BookOpen, Video, Clock,
  Download, CheckCircle2, Lock, ChevronRight, AlertCircle,
  Pause, Volume2, VolumeX, Maximize2, RotateCcw
} from 'lucide-react';
import api from '../../lib/api';

/* ─── helpers ─────────────────────────────────────────── */
const fmt = (min) => min >= 60
  ? `${Math.floor(min / 60)}س ${min % 60}د`
  : `${min} دقيقة`;

/* ─── Custom Video Player ──────────────────────────────── */
function VideoPlayer({ video, onProgressUpdate }) {
  const videoRef = useRef(null);
  const [playing, setPlaying]         = useState(false);
  const [progress, setProgress]       = useState(0);   // 0–100
  const [duration, setDuration]       = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume]           = useState(1);   // 0–1
  const [muted, setMuted]             = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer    = useRef(null);
  const seeking      = useRef(false);
  const saveTimer    = useRef(null);
  const watchStart   = useRef(null);
  const maxProgress  = useRef(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    maxProgress.current = 0;
    watchStart.current = null;
  }, [video?.id]);

  const resetHideTimer = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!seeking.current) setShowControls(false);
    }, 3000);
  };

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else         videoRef.current.play();
  };

  const fmtSec = (s) => {
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  /* ── seek input handlers ── */
  const onSeekChange = (e) => {
    const pct = Number(e.target.value);
    setProgress(pct);
    if (videoRef.current && duration)
      videoRef.current.currentTime = (pct / 100) * duration;
  };

  /* ── volume input handlers ── */
  const onVolumeChange = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted  = v === 0;
    }
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  if (!video) return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-center text-gray-500">
        <Video className="w-20 h-20 mx-auto mb-4 opacity-20" />
        <p className="text-gray-400 font-semibold text-lg">اختر محاضرة للمشاهدة</p>
      </div>
    </div>
  );

  const pct  = `${progress}%`;
  const vol  = `${(muted ? 0 : volume) * 100}%`;

  return (
    <div
      className="relative w-full h-full bg-black"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (!seeking.current && playing) setShowControls(false); }}
    >
      <video
        ref={videoRef}
        key={video.id}
        src={video.file_path_or_url}
        className="w-full h-full object-contain cursor-pointer"
        muted={muted}
        onTimeUpdate={() => {
          if (!videoRef.current || seeking.current) return;
          const ct = videoRef.current.currentTime;
          const d  = duration || 1;
          setCurrentTime(ct);
          const pct = ct / d * 100;
          setProgress(pct);
          if (pct > maxProgress.current) maxProgress.current = pct;
        }}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => {
          setPlaying(false);
          if (onProgressUpdate && video?.id) {
            const d = videoRef.current?.duration || 0;
            onProgressUpdate(video.id, d / 60, 100, true);
          }
        }}
        onPlay={() => {
          setPlaying(true);
          watchStart.current = Date.now();
          saveTimer.current = setInterval(() => {
            if (!videoRef.current) return;
            const d = videoRef.current.duration || 0;
            const watchedMin = d > 0 ? (maxProgress.current / 100) * (d / 60) : 0;
            if (onProgressUpdate && video?.id) {
              onProgressUpdate(video.id, watchedMin, maxProgress.current, false);
            }
          }, 30000);
        }}
        onPause={() => {
          setPlaying(false);
          clearInterval(saveTimer.current);
          if (onProgressUpdate && video?.id && videoRef.current) {
            const d = videoRef.current.duration || 0;
            const watchedMin = d > 0 ? (maxProgress.current / 100) * (d / 60) : 0;
            onProgressUpdate(video.id, watchedMin, maxProgress.current, false);
          }
        }}
        onClick={toggle}
      />

      {/* Big play overlay */}
      {!playing && (
        <button
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="w-20 h-20 rounded-full bg-orange-500/90 flex items-center justify-center shadow-2xl hover:bg-orange-500 hover:scale-110 transition-all duration-200"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            <Play className="w-8 h-8 text-white fill-white mr-[-2px]" />
          </div>
        </button>
      )}

      {/* Controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${
          showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pt-10 pb-3">

          {/* ── Seek bar ── */}
          <div className="mb-3">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              dir="ltr"
              className="player-range player-range-progress"
              style={{ '--pct': pct }}
              onMouseDown={() => { seeking.current = true; }}
              onMouseUp={() => {
                seeking.current = false;
                resetHideTimer();
              }}
              onChange={onSeekChange}
            />
          </div>

          {/* ── Bottom controls ── */}
          <div className="flex items-center gap-3">
            {/* Play / Pause */}
            <button onClick={toggle} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {playing
                ? <Pause className="w-5 h-5 fill-white" />
                : <Play  className="w-5 h-5 fill-white" />
              }
            </button>

            {/* Rewind 10s */}
            <button
              onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}
              className="text-white hover:text-orange-400 transition-colors flex-shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Time */}
            <span className="text-white/70 text-xs font-mono flex-shrink-0">
              {fmtSec(currentTime)} / {fmtSec(duration)}
            </span>

            <div className="flex-1" />

            {/* Volume icon (mute toggle) */}
            <button onClick={toggleMute} className="text-white hover:text-orange-400 transition-colors flex-shrink-0">
              {muted || volume === 0
                ? <VolumeX className="w-5 h-5" />
                : <Volume2 className="w-5 h-5" />
              }
            </button>

            {/* Volume slider */}
            <div className="w-20 flex-shrink-0">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                dir="ltr"
                className="player-range player-range-volume"
                style={{ '--vol': vol }}
                onChange={onVolumeChange}
              />
            </div>

            {/* Fullscreen */}
            <button
              onClick={() => videoRef.current?.requestFullscreen()}
              className="text-white hover:text-orange-400 transition-colors flex-shrink-0"
            >
              <Maximize2 className="w-4 h-4" />
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

  const isLocal = pdf.file_url?.startsWith('/uploads/');

  if (!isLocal) return (
    <div className="w-full h-full flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-sm">
        <div className="w-20 h-20 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-5">
          <FileText className="w-10 h-10 text-orange-500" />
        </div>
        <p className="font-black text-gray-800 text-xl mb-2">{pdf.title}</p>
        <p className="text-gray-400 text-sm mb-6">الملف متاح للتحميل</p>
        <a
          href={pdf.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-all hover:shadow-lg active:scale-95"
        >
          <Download className="w-4 h-4" /> تحميل الملف
        </a>
      </div>
    </div>
  );

  return (
    <iframe
      key={pdf.id}
      src={pdf.file_url}
      className="w-full h-full border-0"
      title={pdf.title}
    />
  );
}

/* ─── Main Page ────────────────────────────────────────── */
export default function CourseView() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [activeVideo, setActiveVideo] = useState(null);
  const [activePdf, setActivePdf] = useState(null);
  const [activeTab, setActiveTab] = useState('videos');

  const handleProgressUpdate = (videoId, watchedMinutes, progressPct, completed) => {
    api.post('/students/me/video-progress', {
      video_id: videoId,
      watched_minutes: Math.round(watchedMinutes * 10) / 10,
      progress_percentage: Math.round(progressPct),
      watch_count_increment: completed ? 1 : 0,
    }).catch(() => {});
  };

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/student/my-courses').then(r => r.data),
  });

  const { data: content, isLoading } = useQuery({
    queryKey: ['course-content', courseId],
    queryFn: () => api.get(`/courses/${courseId}/content`).then(r => r.data),
    enabled: !!courseId,
  });

  const { data: examResults = [] } = useQuery({
    queryKey: ['course-exam-results', courseId],
    queryFn: () => api.get(`/exams/student/course-results/${courseId}`).then(r => r.data),
    enabled: !!courseId,
  });

  const course = courses.find(c => String(c.id) === String(courseId));
  const videos = content?.videos || [];
  const pdfs = content?.pdfs || [];
  const exams = content?.exams || [];

  const currentVideo = activeVideo || videos[0] || null;
  const currentPdf = activePdf || pdfs[0] || null;

  const tabs = [
    { key: 'videos', label: 'المحاضرات', icon: Video, count: videos.length },
    { key: 'pdfs', label: 'الملفات', icon: FileText, count: pdfs.length },
    { key: 'exams', label: 'الاختبارات', icon: BookOpen, count: exams.length },
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
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-80 flex-shrink-0 bg-gray-900 border-l border-white/10 flex flex-col overflow-hidden order-last">

          {/* Course info strip */}
          <div className="flex-shrink-0 px-4 py-4 border-b border-white/10 bg-gradient-to-b from-orange-500/10 to-transparent">
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
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setActiveVideo(v); setActiveTab('videos'); }}
                      className={`w-full text-right flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-orange-500 shadow-lg shadow-orange-500/20'
                          : 'hover:bg-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-500'
                      }`}>
                        {isActive
                          ? <Play className="w-4 h-4 text-white fill-white" />
                          : <span>{i + 1}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
                          {v.title}
                        </p>
                        {v.duration_minutes > 0 && (
                          <p className={`text-xs mt-0.5 flex items-center gap-1 ${isActive ? 'text-white/60' : 'text-gray-600'}`}>
                            <Clock className="w-3 h-3" /> {fmt(v.duration_minutes)}
                          </p>
                        )}
                      </div>
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
            ) : (
              <div className="p-3 space-y-1.5">
                {exams.length === 0 ? (
                  <EmptyState icon={BookOpen} text="لا توجد اختبارات بعد" />
                ) : exams.map(ex => {
                  const myResult = examResults.find(r => String(r.exam_id) === String(ex.id));
                  const passed = myResult && myResult.score >= ex.pass_score;
                  return (
                    <button
                      key={ex.id}
                      onClick={() => myResult ? navigate(`/student/exam-review/${myResult.id}`) : navigate('/student/exams')}
                      className="w-full text-right flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all group"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${myResult ? (passed ? 'bg-green-500/20' : 'bg-red-500/20') : 'bg-purple-500/10'}`}>
                        <BookOpen className={`w-4 h-4 ${myResult ? (passed ? 'text-green-400' : 'text-red-400') : 'text-purple-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-300 group-hover:text-white truncate transition-colors">
                          {ex.title}
                        </p>
                        {myResult ? (
                          <p className={`text-xs mt-0.5 font-bold ${passed ? 'text-green-400' : 'text-red-400'}`}>
                            {myResult.score}/{ex.total_score} · {passed ? '✓ ناجح' : '✗ راسب'}
                            {myResult.essay_graded === false && myResult.has_essay && <span className="mr-1 text-yellow-400">· بانتظار التصحيح المقالي</span>}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-600 mt-0.5">{ex.total_score} درجة · {ex.duration_minutes} دقيقة</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'videos' ? (
            <>
              {/* Video area */}
              <div className="flex-1 bg-black overflow-hidden">
                <VideoPlayer video={currentVideo} onProgressUpdate={handleProgressUpdate} />
              </div>

              {/* Video info bar */}
              {currentVideo && (
                <div className="flex-shrink-0 bg-gray-900 border-t border-white/10 px-6 py-4">
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
                    {videos.map((v, i) => (
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
                    href={currentPdf.file_url}
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
                            {myResult.essay_graded === false && (
                              <span className="text-yellow-400 font-bold flex items-center gap-1 mr-auto">
                                <CheckCircle2 className="w-3 h-3" /> بانتظار تصحيح المقالي
                              </span>
                            )}
                            {myResult.essay_graded === true && myResult.essay_score_adjustment > 0 && (
                              <span className="text-blue-400 font-bold mr-auto">+{myResult.essay_score_adjustment} مقالي</span>
                            )}
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
