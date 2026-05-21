import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSSE } from '../hooks/useSSE';
import { useLiveStream } from '../context/LiveStreamContext';
import {
  LayoutDashboard, Users, BookOpen, FileText, UserCog,
  BarChart3, CreditCard, Trophy, LogOut, Menu, MessageCircle,
  Bell, Database, ClipboardList, Moon, Sun, Inbox, BookMarked, Radio,
  StopCircle, ExternalLink
} from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo.png';

const navItems = [
  { to: '/teacher', icon: LayoutDashboard, label: 'لوحة التحكم', end: true },
  { to: '/teacher/students', icon: Users, label: 'الطلاب' },
  { to: '/teacher/courses', icon: BookOpen, label: 'الكورسات' },
  { to: '/teacher/exams', icon: FileText, label: 'الاختبارات' },
  { to: '/teacher/question-banks', icon: BookMarked, label: 'بنوك الأسئلة' },
  { to: '/teacher/requests', icon: Inbox, label: 'صفحة الطلبات' },
  { to: '/teacher/attendance', icon: ClipboardList, label: 'الحضور والغياب' },
  { to: '/teacher/assistants', icon: UserCog, label: 'المساعدون' },
  { to: '/teacher/analytics', icon: BarChart3, label: 'التحليلات' },
  { to: '/teacher/payments', icon: CreditCard, label: 'المدفوعات' },
  { to: '/teacher/leaderboard', icon: Trophy, label: 'المتصدرون' },
  { to: '/teacher/notifications', icon: Bell, label: 'الإشعارات' },
  { to: '/teacher/backup', icon: Database, label: 'النسخ الاحتياطي' },
  { to: '/teacher/livestream', icon: Radio, label: 'البث المباشر' },
];

export default function TeacherLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { teacherLive, endTeacherStream } = useLiveStream();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const onLivePage = location.pathname === '/teacher/livestream';

  useSSE(!!user, user?.role || 'teacher');

  const handleLogout = () => { logout(); navigate('/login'); };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-white flex-shrink-0 p-0.5">
            <img src={WathbaLogo} alt="وثبة" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl">وثبة</h1>
            <p className="text-navy-100 text-xs font-medium">منصة تعليمية</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold">
            {user?.name?.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{user?.name}</p>
            <p className="text-orange-300 text-xs font-medium">{user?.classification || 'معلم'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}>
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        {user?.whatsapp_phone && (
          <a href={`https://wa.me/${user.whatsapp_phone}`} target="_blank" rel="noopener noreferrer"
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
    <div className={`flex h-screen overflow-hidden ${dark ? '' : 'bg-navy-50'}`}
         style={dark ? { backgroundColor: 'var(--dk-bg)' } : {}}>
      <aside className={`hidden lg:flex w-64 flex-col flex-shrink-0 ${dark ? 'dk-sidebar' : 'bg-navy-500'}`}
             style={dark ? { background: 'linear-gradient(180deg, #161422 0%, #100E1A 100%)', borderLeft: '1px solid rgba(230,175,80,0.12)' } : {}}>
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className={`w-64 flex flex-col ${dark ? '' : 'bg-navy-500'}`}
               style={dark ? { background: 'linear-gradient(180deg, #161422 0%, #100E1A 100%)' } : {}}>
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className={`border-b px-4 lg:px-6 py-3 flex items-center justify-between flex-shrink-0 ${dark ? '' : 'bg-white border-gray-200 shadow-sm'}`}
                style={dark ? {
                  backgroundColor: 'var(--dk-surface)',
                  borderColor: 'var(--dk-border)',
                  boxShadow: '0 1px 0 var(--dk-border)'
                } : {}}>
          <button className={`lg:hidden p-2 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
                  onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className={`text-sm font-medium ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-700'}`}>متصل</span>
            </div>
            <button onClick={toggle}
              className={`p-2 rounded-lg transition-all ${dark ? 'text-amber-400 hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
              title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}>
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {teacherLive && !onLivePage && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0 border-b"
            style={{ backgroundColor: '#7f1d1d', borderColor: 'rgba(239,68,68,0.4)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse flex-shrink-0">
                <Radio className="w-3 h-3" /> مباشر
              </span>
              <p className="text-white text-sm font-bold truncate">{teacherLive.title}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => navigate('/teacher/livestream')}
                className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> العودة للبث
              </button>
              <button onClick={() => { endTeacherStream(); }}
                className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
                <StopCircle className="w-3.5 h-3.5" /> إنهاء
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6"
              style={dark ? { backgroundColor: 'var(--dk-bg)' } : {}}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
