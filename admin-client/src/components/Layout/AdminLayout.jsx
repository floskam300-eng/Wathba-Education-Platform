import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

export default function AdminLayout() {
  const { admin, loading } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('wathba_admin_desktop_sidebar_open');
      if (saved !== null) return saved === 'true';
    } catch (e) {}
    return true;
  });
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) setMobileSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDesktop && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, mobileSidebarOpen]);

  const handleToggleSidebar = () => {
    if (isDesktop) {
      setDesktopSidebarOpen(prev => {
        const next = !prev;
        try { localStorage.setItem('wathba_admin_desktop_sidebar_open', String(next)); } catch (e) {}
        return next;
      });
    } else {
      setMobileSidebarOpen(prev => !prev);
    }
  };

  const handleCloseSidebar = () => {
    if (isDesktop) {
      setDesktopSidebarOpen(false);
      try { localStorage.setItem('wathba_admin_desktop_sidebar_open', 'false'); } catch (e) {}
    } else {
      setMobileSidebarOpen(false);
    }
  };

  const isSidebarOpen = isDesktop ? desktopSidebarOpen : mobileSidebarOpen;

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
          <span className="text-sm font-medium text-slate-400 font-cairo">جاري تحميل لوحة التحكم...</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex bg-slate-950 min-h-screen text-slate-100">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={handleCloseSidebar}
        desktopOpen={desktopSidebarOpen}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={handleToggleSidebar}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label={isSidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}
            title={isSidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <img src="/wathba-logo.png" alt="وثبة" className="h-7 w-7 rounded-lg object-cover" />
            <span className="text-sm font-bold text-white font-cairo">وثبة الإدارية</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
