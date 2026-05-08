import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LayoutDashboard, BookOpen, FileText, Trophy, LogOut, Menu, BarChart2, Moon, Sun } from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo.png';

const navItems = [
  { to: '/student', icon: LayoutDashboard, label: 'لوحتي', end: true },
  { to: '/student/courses', icon: BookOpen, label: 'كورساتي' },
  { to: '/student/exams', icon: FileText, label: 'الاختبارات' },
  { to: '/student/stats', icon: BarChart2, label: 'إحصائياتي' },
  { to: '/student/leaderboard', icon: Trophy, label: 'المتصدرون' },
];

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
            <p className="text-navy-100 text-xs font-medium">منطقة الطالب</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{user?.name}</p>
            <p className="text-orange-300 text-xs font-semibold flex items-center gap-1">⭐ {user?.points || 0} نقطة</p>
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
    <div className={`flex h-screen overflow-hidden ${dark ? 'bg-slate-900' : 'bg-navy-50'}`}>
      <aside className="hidden lg:flex w-64 bg-navy-500 flex-col flex-shrink-0">
        <Sidebar />
      </aside>
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-navy-500 flex flex-col"><Sidebar /></div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className={`border-b px-4 py-3 flex items-center justify-between shadow-sm ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <button className={`lg:hidden p-2 rounded-lg ${dark ? 'text-slate-300 hover:bg-slate-700' : 'text-navy-600 hover:bg-gray-100'}`} onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className={`text-sm font-semibold ${dark ? 'text-slate-200' : 'text-gray-700'}`}>مرحباً {user?.name} 👋</span>
          <button onClick={toggle}
            className={`p-2 rounded-lg transition-all ${dark ? 'text-yellow-400 hover:bg-slate-700' : 'text-navy-600 hover:bg-gray-100'}`}
            title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>
        <main className="flex-1 overflow-hidden"><Outlet /></main>
      </div>
    </div>
  );
}
