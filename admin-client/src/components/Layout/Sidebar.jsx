import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutDashboard, Users, CreditCard, ShieldAlert, BadgeDollarSign, LogOut } from 'lucide-react';

export default function Sidebar() {
  const { logout, admin } = useAuth();

  const links = [
    { to: '/', name: 'الرئيسية', icon: LayoutDashboard },
    { to: '/teachers', name: 'المدرسين', icon: Users },
    { to: '/plans', name: 'الباقات', icon: ShieldAlert },
    { to: '/subscriptions', name: 'الاشتراكات', icon: CreditCard },
    { to: '/payments', name: 'المدفوعات المالية', icon: BadgeDollarSign },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col h-screen sticky top-0 select-none">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-center mb-3">
          <img src="/wathba-logo.png" alt="وثبة" className="h-12 w-auto object-contain" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <h2 className="text-xl font-bold text-white tracking-wide font-cairo text-center">وثبة الإدارية</h2>
        </div>
        {admin && (
          <div className="mt-2 text-center text-xs text-amber-500 font-cairo bg-amber-500/10 py-1 px-3 rounded-full border border-amber-500/20">
            مرحباً، {admin.name} ({admin.role === 'super_admin' ? 'مدير عام' : 'مشرف'})
          </div>
        )}
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium font-cairo transition ${
                  isActive
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon size={18} />
              <span>{link.name}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium font-cairo text-red-400 hover:bg-red-950/30 hover:text-red-300 transition"
        >
          <LogOut size={18} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
