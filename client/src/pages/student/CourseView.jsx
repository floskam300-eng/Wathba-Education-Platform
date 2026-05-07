import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Play, FileText, BookOpen,
  Video, Clock, Download, ExternalLink, AlertCircle
} from 'lucide-react';
import api from '../../lib/api';

function isLocalFile(url) {
  return url && url.startsWith('/uploads/');
}

function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}?rel=0` : null;
}

function isYouTube(url) {
  return url && (url.includes('youtube.com') || url.includes('youtu.be'));
}

function VideoPlayer({ video }) {
  if (!video) return null;
  const url = video.file_path_or_url;

  if (isLocalFile(url)) {
    return (
      <video
        key={video.id}
        src={url}
        controls
        autoPlay
        className="w-full h-full object-contain bg-black"
      />
    );
  }

  const embedUrl = getYouTubeEmbedUrl(url);
  if (embedUrl) {
    return (
      <iframe
        key={video.id}
        src={embedUrl}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={video.title}
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-center text-white p-8">
        <Play className="w-16 h-16 mx-auto mb-4 opacity-40" />
        <p className="font-bold text-lg mb-2">{video.title}</p>
        <p className="text-gray-400 text-sm mb-6">هذا الفيديو متاح عبر رابط خارجي</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> مشاهدة الفيديو
        </a>
      </div>
    </div>
  );
}

function PdfViewer({ pdf }) {
  const [error, setError] = useState(false);
  if (!pdf) return null;
  const url = pdf.file_url;

  const isExternal = url && (url.startsWith('http://') || url.startsWith('https://'));

  if (error || (!isLocalFile(url) && !isExternal)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <AlertCircle className="w-14 h-14 mx-auto mb-4 text-orange-400" />
          <p className="font-bold text-gray-700 text-lg mb-2">{pdf.title}</p>
          <p className="text-gray-400 text-sm mb-6">الملف غير متاح للعرض المباشر</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <Download className="w-4 h-4" /> تحميل الملف
          </a>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={pdf.id}
      src={url}
      className="w-full h-full border-0 bg-white"
      title={pdf.title}
      onError={() => setError(true)}
    />
  );
}

export default function CourseView() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [activeVideo, setActiveVideo] = useState(null);
  const [activePdf, setActivePdf] = useState(null);
  const [activeTab, setActiveTab] = useState('videos');

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/student/my-courses').then(r => r.data),
  });

  const { data: content, isLoading } = useQuery({
    queryKey: ['course-content', courseId],
    queryFn: () => api.get(`/courses/${courseId}/content`).then(r => r.data),
    enabled: !!courseId,
  });

  const course = courses.find(c => String(c.id) === String(courseId));
  const videos = content?.videos || [];
  const pdfs = content?.pdfs || [];
  const exams = content?.exams || [];

  const currentVideo = activeVideo || videos[0] || null;
  const currentPdf = activePdf || pdfs[0] || null;

  const tabs = [
    { key: 'videos', label: 'الفيديوهات', icon: Video, count: videos.length },
    { key: 'pdfs', label: 'الملفات', icon: FileText, count: pdfs.length },
    { key: 'exams', label: 'الاختبارات', icon: BookOpen, count: exams.length },
  ];

  return (
    <div className="flex flex-col h-full -m-4 lg:-m-6">

      {/* ── Top header bar ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 lg:px-6 py-3 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/student/courses')}
            className="flex items-center gap-1.5 text-sm font-bold text-navy-600 hover:text-orange-500 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>كورساتي</span>
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-sm font-black text-gray-800 truncate">{course?.name || 'الكورس'}</h1>
        </div>
      </div>

      {/* ── Main body: video area + sidebar ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Video / PDF / Exams main area ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-900 order-1 lg:order-2">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTab === 'videos' ? (
            <>
              <div className="flex-1 overflow-hidden bg-black">
                {currentVideo ? (
                  <VideoPlayer video={currentVideo} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <Video className="w-16 h-16 mx-auto mb-3 opacity-20" />
                      <p className="text-gray-400 font-medium">لا توجد فيديوهات في هذا الكورس</p>
                    </div>
                  </div>
                )}
              </div>
              {currentVideo && (
                <div className="flex-shrink-0 bg-gray-800 px-5 py-3">
                  <p className="text-white font-black text-sm">{currentVideo.title}</p>
                  {currentVideo.duration_minutes > 0 && (
                    <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {currentVideo.duration_minutes} دقيقة
                    </p>
                  )}
                </div>
              )}
            </>
          ) : activeTab === 'pdfs' ? (
            <>
              <div className="flex-shrink-0 bg-gray-800 px-5 py-3 flex items-center justify-between gap-3">
                <p className="text-white font-black text-sm truncate">
                  {currentPdf?.title || 'اختر ملفاً'}
                </p>
                {currentPdf && (
                  <a
                    href={currentPdf.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> تحميل
                  </a>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                {currentPdf ? (
                  <PdfViewer key={currentPdf.id} pdf={currentPdf} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-gray-400 p-8">
                      <FileText className="w-16 h-16 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">لا توجد ملفات في هذا الكورس</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400 p-8">
                <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-bold text-white mb-2">الاختبارات</p>
                <p className="text-gray-400 text-sm mb-6">
                  يمكنك الوصول إلى اختبارات هذا الكورس من صفحة الاختبارات
                </p>
                <button
                  onClick={() => navigate('/student/exams')}
                  className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> الذهاب للاختبارات
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ── Sidebar: content list ── */}
        <aside className="w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col order-2 lg:order-1 lg:h-full overflow-hidden">

          {/* Tab switcher */}
          <div className="flex flex-shrink-0 border-b border-gray-100">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-bold transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? 'text-orange-500 border-orange-500 bg-orange-50/50'
                    : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-[10px] rounded-full px-1.5 font-black ${
                  activeTab === tab.key ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : activeTab === 'videos' ? (
              <div className="p-3 space-y-2">
                {videos.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Video className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">لا توجد فيديوهات بعد</p>
                  </div>
                ) : videos.map((v, i) => {
                  const isActive = currentVideo?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setActiveVideo(v); setActiveTab('videos'); }}
                      className={`w-full text-right flex items-center gap-3 p-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-navy-600 text-white shadow-md'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-white/20' : 'bg-navy-100'
                      }`}>
                        <Play className={`w-4 h-4 ${isActive ? 'text-white' : 'text-navy-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{v.title}</p>
                        {v.duration_minutes > 0 && (
                          <p className={`text-xs flex items-center gap-1 mt-0.5 ${
                            isActive ? 'text-white/70' : 'text-gray-400'
                          }`}>
                            <Clock className="w-3 h-3" /> {v.duration_minutes} دقيقة
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : activeTab === 'pdfs' ? (
              <div className="p-3 space-y-2">
                {pdfs.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">لا توجد ملفات بعد</p>
                  </div>
                ) : pdfs.map(p => {
                  const isActive = (activePdf || pdfs[0])?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setActivePdf(p); setActiveTab('pdfs'); }}
                      className={`w-full text-right flex items-center gap-3 p-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-white/20' : 'bg-orange-100'
                      }`}>
                        <FileText className={`w-4 h-4 ${isActive ? 'text-white' : 'text-orange-600'}`} />
                      </div>
                      <p className="flex-1 font-bold text-sm text-right truncate">{p.title}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {exams.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">لا توجد اختبارات بعد</p>
                  </div>
                ) : exams.map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => navigate('/student/exams')}
                    className="w-full text-right flex items-center gap-3 p-3 rounded-xl bg-purple-50 hover:bg-purple-100 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-purple-800 truncate">{ex.title}</p>
                      <p className="text-xs text-purple-500 mt-0.5">
                        {ex.total_score} درجة · {ex.duration_minutes} دقيقة
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
