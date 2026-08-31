import React, { createContext, useContext, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import PWAInstallBanner from '../components/PWAInstallBanner';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { getTenantSlug } from '../lib/tenant';

const TeacherContext = createContext(null);

function applyFavicon(url) {
  const setHref = (dataUrl) => {
    const selectors = [
      "link[rel='icon']",
      "link[rel='shortcut icon']",
      "link[rel~='icon']",
      "link[rel='apple-touch-icon']",
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.href = dataUrl; });
    });
  };

  const drawRounded = (imgEl) => {
    try {
      const size = 64;
      const radius = 14;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(size - radius, 0);
      ctx.quadraticCurveTo(size, 0, size, radius);
      ctx.lineTo(size, size - radius);
      ctx.quadraticCurveTo(size, size, size - radius, size);
      ctx.lineTo(radius, size);
      ctx.quadraticCurveTo(0, size, 0, size - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(imgEl, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/png');
      setHref(dataUrl);
    } catch (_) {
      setHref(url);
    }
  };

  // Only attempt crossOrigin='anonymous' for same-origin images.
  // External logos (e.g. ui-avatars.com) don't support CORS, causing a
  // console error that Lighthouse flags as a Best Practices failure.
  // For external URLs we skip straight to the canvas-without-CORS path,
  // which will hit the tainted-canvas catch and fall back to setHref(url).
  const isSameOrigin = (() => {
    try { return new URL(url).origin === window.location.origin; }
    catch (_) { return false; }
  })();

  const img = new Image();
  if (isSameOrigin) img.crossOrigin = 'anonymous';
  img.onload = () => drawRounded(img);
  img.onerror = () => {
    if (!isSameOrigin) { setHref(url); return; }
    const img2 = new Image();
    img2.onload = () => drawRounded(img2);
    img2.onerror = () => setHref(url);
    img2.src = url;
  };
  img.src = url;
}

function applyManifest(appName) {
  let link = document.querySelector("link[rel='manifest']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = `/manifest.json`;

  const setMeta = (name, val) => {
    let el = document.querySelector(`meta[name='${name}']`);
    if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
    el.content = val;
  };
  setMeta('apple-mobile-web-app-title', appName);
  setMeta('application-name', appName);
}

export function TeacherProvider({ children }) {
  const teacherSlug = getTenantSlug();

  const { data, isPending, isError } = useQuery({
    queryKey: ['teacher-public', teacherSlug],
    queryFn: () => api.get('/public/info').then(r => r.data),
    enabled: !!teacherSlug,
    staleTime: 5 * 1000,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 8000),
  });

  const teacher = data?.teacher || null;
  const platformName = teacher?.platform_name || teacher?.pwa_name || teacher?.name || 'منصة تعليمية';
  // URLs stored by the admin upload endpoint already start with /uploads/admin/...
  // so we must NOT prepend /uploads/ again. Only prepend for legacy bare filenames.
  const resolveUploadUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/')) return url;
    return `/uploads/${url}`;
  };
  const logoUrl = resolveUploadUrl(teacher?.logo_url);

  useEffect(() => {
    if (!teacher) return;
    document.title = platformName;
    if (logoUrl) applyFavicon(logoUrl);
    applyManifest(platformName);
  }, [teacher, platformName, logoUrl]);

  const fe = teacher?.features_enabled || {};
  const features = {
    // ── Legacy keys (backward compat) ──────────────────────────────
    live_streaming:  fe.live_streaming  !== false,
    stickman_run:    fe.stickman_run    !== false,
    // ── Teacher sidebar pages ───────────────────────────────────────
    students:        fe.students        !== false,
    courses:         fe.courses         !== false,
    exams:           fe.exams           !== false,
    recitations:     fe.recitations     !== false,
    archive:         fe.archive         !== false,
    question_banks:  fe.question_banks  !== false,
    requests:        fe.requests        !== false,
    attendance:      fe.attendance      !== false,
    class_attendance: fe.class_attendance !== false,
    assistants:      fe.assistants      !== false,
    analytics:       fe.analytics       !== false,
    payments:        fe.payments        !== false,
    leaderboard:     fe.leaderboard     !== false,
    notifications:   fe.notifications   !== false,
    backup:          fe.backup          !== false,
    activity_log:    fe.activity_log    !== false,
    settings:        fe.settings        !== false,
    // ── Student-only pages ─────────────────────────────────────────
    student_stats:   fe.student_stats   !== false,
  };

  return (
    <TeacherContext.Provider value={{
      teacher,
      stats: data?.stats || null,
      courses: data?.courses || [],
      topCourses: data?.topCourses || [],
      supportContacts: data?.supportContacts || [],
      team: data?.team || [],
      isLoading: isPending,
      isError,
      teacherSlug,
      platformName,
      logoUrl,
      features,
    }}>
      {children}
    </TeacherContext.Provider>
  );
}

function TeacherOutlet() {
  const { isLoading, isError, teacher, logoUrl, platformName } = useTeacher();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#05080f]">
        <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !teacher) {
    return <TeacherNotFound />;
  }

  return (
    <>
      <Outlet />
      <PWAInstallBanner logoUrl={logoUrl} platformName={platformName} />
    </>
  );
}

export function TeacherWrapper() {
  const teacherSlug = getTenantSlug();
  return (
    <TeacherProvider key={teacherSlug}>
      <TeacherOutlet />
    </TeacherProvider>
  );
}

export function TeacherNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05080f] text-white" dir="rtl">
      <div className="text-center p-8">
        <div className="text-8xl mb-6">🔍</div>
        <h1 className="text-3xl font-black mb-3">المنصة غير موجودة</h1>
        <p className="text-white/50 text-lg mb-6">
          تأكد من الرابط أو تواصل مع المعلم للحصول على الرابط الصحيح.
        </p>
      </div>
    </div>
  );
}

export const useTeacher = () => {
  const ctx = useContext(TeacherContext);
  if (!ctx) throw new Error('useTeacher must be used within TeacherProvider');
  return ctx;
};
