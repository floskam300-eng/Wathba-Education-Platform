import React, { useState, useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LayoutDashboard, Users, LogOut, Menu, FileText, BarChart3, BookOpen, CreditCard, Moon, Sun, MessageCircle, Inbox, BookMarked } from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo.png';
import { useSSE } from '../hooks/useSSE';

export default function AssistantLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useSSE(!!user, 'assistant');

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = useMemo(() => {
    const items = [
      { to: '/assistant', icon: LayoutDashboard, label: 'لوحة التحكم', end: true },
    ];
    if (user?.role === 'assistant') {
      items.push({ to: '/assistant/students', icon: Users, label: 'الطلاب' });
      if (user?.can_manage_exams) items.push({ to: '/assistant/exams', icon: FileText, label: 'الاختبارات' });
      if (user?.can_manage_exams) items.push({ to: '/assistant/question-banks', icon: BookMarked, label: 'بنوك الأسئلة' });
      if (user?.can_manage_courses) items.push({ to: '/assistant/courses', icon: BookOpen, label: 'الكورسات' });
      if (user?.can_manage_payments) items.push({ to: '/assistant/payments', icon: CreditCard, label: 'المدفوعات' });
      if (user?.can_view_analytics) items.push({ to: '/assistant/analytics', icon: BarChart3, label: 'التحليلات' });
      if (user?.can_send_notifications) items.push({ to: '/assistant/notifications', icon: MessageCircle, label: 'الإشعارات' });
      if (user?.can_manage_exams || user?.can_manage_courses) items.push({ to: '/assistant/requests', icon: Inbox, label: 'الطلبات' });
    }
    return items;
  }, [user]);

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-white flex-shrink-0 p-0.5">
            <img src={WathbaLogo} alt="وثبة" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl">وثبة</h1>
            <p className="text-navy-100 text-xs font-medium">لوحة المساعد</p>
          </div>
        </div>
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

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}>
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
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
      <aside className={`hidden lg:flex w-64 flex-col flex-shrink-0 ${dark ? '' : 'bg-navy-500'}`}
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
        <header className={`border-b px-4 py-3 flex items-center justify-between flex-shrink-0 ${dark ? '' : 'bg-white border-gray-200 shadow-sm'}`}
                style={dark ? { backgroundColor: 'var(--dk-surface)', borderColor: 'var(--dk-border)', boxShadow: '0 1px 0 var(--dk-border)' } : {}}>
          <button className={`lg:hidden p-2 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
                  onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className={`text-sm font-semibold ${dark ? 'text-[var(--dk-text-1)]' : 'text-gray-700'}`}>لوحة المساعد</span>
          <button onClick={toggle}
            className={`p-2 rounded-lg transition-all ${dark ? 'text-amber-400 hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
            title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6"
              style={dark ? { backgroundColor: 'var(--dk-bg)' } : {}}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
