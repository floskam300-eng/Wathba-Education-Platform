import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutDashboard, Users, CreditCard, ShieldAlert, BadgeDollarSign, LogOut, X } from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { logout, admin } = useAuth();

  const links = [
    { to: '/', name: 'الرئيسية', icon: LayoutDashboard },
    { to: '/teachers', name: 'المدرسين', icon: Users },
    { to: '/plans', name: 'الباقات', icon: ShieldAlert },
    { to: '/subscriptions', name: 'الاشتراكات', icon: CreditCard },
    { to: '/payments', name: 'المدفوعات المالية', icon: BadgeDollarSign },
  ];

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const sidebarContent = (
    <aside className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col h-full select-none">
      {/* Mobile close button */}
      <button
        type="button"
        onClick={onClose}
        className="lg:hidden absolute top-3 left-3 p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition z-10"
        aria-label="إغلاق القائمة"
      >
        <X size={18} />
      </button>

      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-center mb-3">
          <img src="/wathba-logo.png" alt="وثبة" className="h-12 w-12 object-cover rounded-2xl shadow-lg shadow-amber-500/20" />
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
              onClick={onClose}
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

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:sticky lg:top-0 lg:h-screen flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Drawer panel — slides in from right (RTL) */}
          <div className="relative w-64 flex-shrink-0 mr-auto h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
