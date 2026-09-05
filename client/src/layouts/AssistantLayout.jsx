import React, { useState, useMemo, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTeacher } from '../context/TeacherContext';
import { LayoutDashboard, Users, LogOut, Menu, FileText, BarChart3, BookOpen, CreditCard, Moon, Sun, MessageCircle, Inbox, BookMarked, GraduationCap, Archive, CalendarCheck, Gamepad2, X, PanelRightClose } from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo.png';
import { useSSE } from '../hooks/useSSE';
import { refreshMediaToken } from '../lib/mediaAccess';

export default function AssistantLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('wathba_desktop_sidebar_open');
      if (saved !== null) return saved === 'true';
    } catch (e) {}
    return true;
  });
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setMobileSidebarOpen(false);
      }
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
        try { localStorage.setItem('wathba_desktop_sidebar_open', String(next)); } catch (e) {}
        return next;
      });
    } else {
      setMobileSidebarOpen(prev => !prev);
    }
  };

  const handleCloseSidebar = () => {
    if (isDesktop) {
      setDesktopSidebarOpen(false);
      try { localStorage.setItem('wathba_desktop_sidebar_open', 'false'); } catch (e) {}
    } else {
      setMobileSidebarOpen(false);
    }
  };

  const isSidebarOpen = isDesktop ? desktopSidebarOpen : mobileSidebarOpen;

  useSSE(!!user, 'assistant');

  useEffect(() => {
    if (!user) return;
    refreshMediaToken();
    const id = setInterval(refreshMediaToken, 12 * 60 * 1000);
    return () => clearInterval(id);
  }, [user?.id]);

  const handleLogout = () => { logout(); };

  const navItems = useMemo(() => {
    const items = [
      { to: '/assistant', icon: LayoutDashboard, label: 'لوحة التحكم', end: true },
    ];
    if (user?.role === 'assistant') {
      if (features?.students !== false) items.push({ to: '/assistant/students', icon: Users, label: 'الطلاب' });
      if (features?.exams !== false && user?.can_manage_exams) items.push({ to: '/assistant/exams', icon: FileText, label: 'الاختبارات' });
      if (features?.stickman_run !== false && user?.can_manage_events) items.push({ to: '/assistant/events', icon: Gamepad2, label: 'إدارة الفعاليات 🎮' });
      if (features?.recitations !== false && user?.can_manage_recitations) items.push({ to: '/assistant/recitations', icon: GraduationCap, label: 'التسميع' });
      if ((features?.archive !== false) && (user?.can_view_analytics || user?.can_manage_exams || user?.can_manage_recitations))
        items.push({ to: '/assistant/archive', icon: Archive, label: 'أرشيف النتائج' });
      if (features?.question_banks !== false && user?.can_manage_exams) items.push({ to: '/assistant/question-banks', icon: BookMarked, label: 'بنوك الأسئلة' });
      if (features?.courses !== false && user?.can_manage_courses) items.push({ to: '/assistant/courses', icon: BookOpen, label: 'الكورسات' });
      if (features?.payments !== false && user?.can_manage_payments) items.push({ to: '/assistant/payments', icon: CreditCard, label: 'المدفوعات' });
      if (features?.analytics !== false && user?.can_view_analytics) items.push({ to: '/assistant/analytics', icon: BarChart3, label: 'التحليلات' });
      if (features?.notifications !== false && user?.can_send_notifications) items.push({ to: '/assistant/notifications', icon: MessageCircle, label: 'الإشعارات' });
      if ((features?.requests !== false) && (user?.can_manage_exams || user?.can_manage_courses)) items.push({ to: '/assistant/requests', icon: Inbox, label: 'الطلبات' });
      if (features?.class_attendance !== false && user?.can_manage_attendance) items.push({ to: '/assistant/class-attendance', icon: CalendarCheck, label: 'الحضور والغياب' });
    }
    return items;
  }, [user, features]);

  const displayLogo = logoUrl || WathbaLogo;

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 lg:p-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl overflow-hidden flex-shrink-0">
            <img src={displayLogo} alt={platformName} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-black text-lg lg:text-xl leading-tight truncate">{platformName}</h1>
            <p className="text-navy-100 text-xs font-medium">لوحة المساعد</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCloseSidebar}
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title="إغلاق القائمة الجانبية"
          aria-label="إغلاق القائمة الجانبية"
        >
          <PanelRightClose className="w-5 h-5 hidden lg:block" />
          <X className="w-5 h-5 lg:hidden" />
        </button>
      </div>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{user?.name}</p>
            <p className="text-orange-300 text-xs font-medium">مساعد</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (!isDesktop) setMobileSidebarOpen(false);
            }}>
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        {teacher?.support_form_url && (
          <a href={teacher.support_form_url} target="_blank" rel="noopener noreferrer"
            className="sidebar-link">
            <MessageCircle className="w-5 h-5" />
            <span>مركز المساعدة</span>
          </a>
        )}
        <button onClick={handleLogout} className="sidebar-link w-full text-red-200 hover:bg-red-500/20 hover:text-red-100">
          <LogOut className="w-5 h-5" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`app-root-layout flex overflow-hidden ${dark ? '' : 'bg-navy-50'}`}
         style={dark ? { backgroundColor: 'var(--dk-bg)' } : {}}>
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 transition-[width,opacity] duration-300 ease-in-out overflow-hidden z-20 ${
          desktopSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'
        } ${dark ? '' : 'bg-navy-500'}`}
        style={dark ? {
          background: 'linear-gradient(180deg, #0d1522 0%, #080d14 100%)',
          borderLeft: desktopSidebarOpen ? '1px solid rgba(245,166,35,0.15)' : 'none',
        } : {}}
      >
        <div className="w-64 min-w-[16rem] h-full flex flex-col">
          <Sidebar />
        </div>
      </aside>
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className={`app-sidebar-panel w-64 flex flex-col ${dark ? '' : 'bg-navy-500'}`}
               style={dark ? { background: 'linear-gradient(180deg, #0d1522 0%, #080d14 100%)' } : {}}>
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className={`app-header-safe border-b px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0 ${dark ? '' : 'bg-white border-gray-200 shadow-sm'}`}
                style={dark ? { backgroundColor: 'var(--dk-surface)', borderColor: 'var(--dk-border)', boxShadow: '0 1px 0 var(--dk-border)' } : {}}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className={`flex-shrink-0 p-2 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
              onClick={handleToggleSidebar}
              aria-label={isSidebarOpen ? "إغلاق القائمة الجانبية" : "فتح القائمة الجانبية"}
              title={isSidebarOpen ? "إغلاق القائمة الجانبية" : "فتح القائمة الجانبية"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className={`text-sm font-semibold min-w-0 truncate ${dark ? 'text-[var(--dk-text-1)]' : 'text-gray-700'}`}>لوحة المساعد</span>
          </div>
          <button onClick={toggle}
            className={`flex-shrink-0 p-2 rounded-lg transition-all ${dark ? 'text-amber-400 hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
            title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 min-w-0"
              style={dark ? { backgroundColor: 'var(--dk-bg)' } : {}}>
          <React.Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
            </div>
          }>
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}
