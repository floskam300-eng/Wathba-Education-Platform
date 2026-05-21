import React, { createContext, useContext, useEffect } from 'react';
import { useParams, Outlet, Navigate } from 'react-router-dom';
import PWAInstallBanner from '../components/PWAInstallBanner';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const TeacherContext = createContext(null);

function applyFavicon(url) {
  const selectors = [
    "link[rel='icon']",
    "link[rel='shortcut icon']",
    "link[rel~='icon']",
    "link[rel='apple-touch-icon']",
  ];
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => { el.href = url; });
  });
}

function applyManifest(slug, appName) {
  let link = document.querySelector("link[rel='manifest']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = `/api/public/manifest/${slug}`;

  const setMeta = (name, val) => {
    let el = document.querySelector(`meta[name='${name}']`);
    if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
    el.content = val;
  };
  setMeta('apple-mobile-web-app-title', appName);
  setMeta('application-name', appName);
}

export function TeacherProvider({ children }) {
  const { teacherSlug } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher-public', teacherSlug],
    queryFn: () => axios.get(`/api/public/info?slug=${teacherSlug}`).then(r => r.data),
    enabled: !!teacherSlug,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const teacher = data?.teacher || null;
  const platformName = teacher?.platform_name || teacher?.name || 'منصة تعليمية';
  const logoUrl = teacher?.logo_url
    ? (teacher.logo_url.startsWith('http') ? teacher.logo_url : `/uploads/${teacher.logo_url}`)
    : null;

  useEffect(() => {
    if (!teacher) return;
    document.title = platformName;
    if (logoUrl) applyFavicon(logoUrl);
    applyManifest(teacherSlug, platformName);
  }, [teacher, platformName, logoUrl, teacherSlug]);

  return (
    <TeacherContext.Provider value={{
      teacher,
      stats: data?.stats || null,
      courses: data?.courses || [],
      assistants: data?.assistants || [],
      isLoading,
      isError,
      teacherSlug,
      platformName,
      logoUrl,
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
  const { teacherSlug } = useParams();
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
