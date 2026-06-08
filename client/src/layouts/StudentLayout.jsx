import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTeacher } from '../context/TeacherContext';
import {
  LayoutDashboard, BookOpen, FileText, Trophy, LogOut,
  Menu, BarChart2, Moon, Sun, Bell, CheckCheck, X, ShieldAlert, Radio,
  StopCircle, ExternalLink, Gamepad2,
} from 'lucide-react';
import { useLiveStream } from '../context/LiveStreamContext';
import WathbaLogo from '../assets/wathba_logo.png';
import { useSSE } from '../hooks/useSSE';
import { useFCM } from '../hooks/useFCM';
import { refreshMediaToken } from '../lib/mediaAccess';
import api from '../lib/api';
import { useAntiCapture } from '../hooks/useAntiCapture';

const EVENTS_NAV_CSS = `
  .events-nav-link {
    position: relative; display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 14px; font-size: 14px; font-weight: 900;
    cursor: pointer; overflow: hidden; color: white; text-decoration: none;
    background: linear-gradient(135deg, #7c3aed 0%, #ec4899 55%, #f97316 100%);
    box-shadow: 0 4px 18px rgba(124,58,237,.4);
    transition: transform .2s, box-shadow .2s;
  }
  .events-nav-link:hover { transform: scale(1.03); box-shadow: 0 6px 26px rgba(124,58,237,.6); }
  .events-nav-link::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
    background-size: 200% 100%;
    animation: eventsShimmer 2.4s linear infinite;
  }
  @keyframes eventsShimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
`;

const TYPE_ICON = {
  general:             '📢',
  exam_result:         '📊',
  new_exam:            '📝',
  new_course:          '📚',
  retry_approved:      '🔄',
  enrollment_approved: '🎓',
  reminder:            '⏰',
  announcement:        '📣',
  payment:             '💳',
  badge:               '🏅',
};

const fmtDate = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `منذ ${days} يوم`;
  return new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

const BELL_LIMIT = 5;

function NotificationBell({ dark }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data = { notifications: [], unread: 0 } } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: () => api.get('/notifications/my').then(r => r.data),
    refetchInterval: 60000,
  });

  const readAllMut = useMutation({
    mutationFn: () => api.patch('/notifications/my/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  const readOneMut = useMutation({
    mutationFn: (id) => api.patch(`/notifications/my/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const onPlatformNotif = () => {
      qc.invalidateQueries({ queryKey: ['my-notifications'] });
    };
    window.addEventListener('wathba_platform_notification', onPlatformNotif);
    return () => window.removeEventListener('wathba_platform_notification', onPlatformNotif);
  }, [qc]);

  const { notifications, unread } = data;
  const preview = notifications.slice(0, BELL_LIMIT);
  const hasMore = notifications.length > BELL_LIMIT;

  const surfaceStyle = dark
    ? { backgroundColor: 'var(--dk-surface)', borderColor: 'var(--dk-border)', color: 'var(--dk-text)' }
    : {};

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-all ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
        title="الإشعارات"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`notif-dropdown rounded-2xl border shadow-xl overflow-hidden ${dark ? '' : 'bg-white border-slate-200'}`}
          style={dark ? { ...surfaceStyle, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' } : {}}
        >
          <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-slate-100'}`}>
            <div className="flex items-center gap-2">
              <Bell className={`w-4 h-4 ${dark ? 'text-amber-400' : 'text-indigo-500'}`} />
              <span className={`font-black text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                الإشعارات
              </span>
              {unread > 0 && (
                <span className="text-xs bg-red-100 text-red-600 font-black px-1.5 py-0.5 rounded-full">
                  {unread} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => readAllMut.mutate()}
                  disabled={readAllMut.isPending}
                  className={`text-xs font-bold flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${dark ? 'text-amber-400 hover:bg-[var(--dk-elevated)]' : 'text-indigo-600 hover:bg-indigo-50'}`}
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck className="w-3 h-3" /> الكل
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className={`p-1 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            {preview.length === 0 ? (
              <div className="text-center py-10">
                <Bell className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
                <p className={`text-sm font-medium ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                  لا توجد إشعارات بعد
                </p>
              </div>
            ) : (
              <div className={`divide-y ${dark ? 'divide-[var(--dk-border)]' : 'divide-slate-100'}`}>
                {preview.map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) readOneMut.mutate(n.id);
                      setOpen(false);
                      const t = n.type || '';
                      if (t.includes('exam') || t.includes('result') || t.includes('retry')) navigate('/student/exams');
                      else if (t.includes('course') || t.includes('enroll')) navigate('/student/courses');
                      else if (t.includes('live') || t.includes('stream')) navigate('/student/live');
                    }}
                    className={`px-4 py-3 cursor-pointer transition-all ${
                      !n.is_read
                        ? dark ? 'bg-amber-400/8 hover:bg-amber-400/12' : 'bg-indigo-50/70 hover:bg-indigo-100/60'
                        : dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex gap-3">
                      <span className="text-xl flex-shrink-0 mt-0.5">
                        {TYPE_ICON[n.type] || '📢'}
                      </span>
                      <div className="flex-1 min-w-0">
                        {n.title && (
                          <p className={`text-xs font-black mb-0.5 ${dark ? 'text-amber-400' : 'text-indigo-600'}`}>
                            {n.title}
                          </p>
                        )}
                        <p className={`text-sm leading-snug ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                          {n.message}
                        </p>
                        <p className={`text-xs mt-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                          {fmtDate(n.sent_at)}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(hasMore || notifications.length > 0) && (
            <div className={`border-t ${dark ? 'border-[var(--dk-border)]' : 'border-slate-100'}`}>
              <button
                onClick={() => { setOpen(false); navigate('/student/notifications'); }}
                className={`w-full py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  dark
                    ? 'text-amber-400 hover:bg-[var(--dk-elevated)]'
                    : 'text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                {hasMore ? `عرض المزيد (${notifications.length - BELL_LIMIT} إشعار آخر)` : 'عرض كل الإشعارات'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { studentStream, leaveStudentStream, availableLive, clearAvailableLive } = useLiveStream();
  const { platformName, logoUrl } = useTeacher();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [captureWarning, setCaptureWarning] = useState(false);
  const warningTimer = useRef(null);

  const onLivePage = location.pathname.endsWith('/live');

  const navItems = [
    { to: '/student',              icon: LayoutDashboard, label: 'لوحتي',       end: true },
    { to: '/student/courses',      icon: BookOpen,        label: 'كورساتي' },
    { to: '/student/exams',        icon: FileText,        label: 'الاختبارات' },
    { to: '/student/stats',        icon: BarChart2,       label: 'إحصائياتي' },
    { to: '/student/leaderboard',  icon: Trophy,          label: 'المتصدرون' },
    { to: '/student/live',         icon: Radio,           label: 'بث مباشر' },
  ];

  useSSE(!!user, user?.role || 'student');
  useFCM(!!user && user?.role === 'student');

  useEffect(() => {
    if (!user) return;
    refreshMediaToken();
    const id = setInterval(refreshMediaToken, 12 * 60 * 1000);
    return () => clearInterval(id);
  }, [user?.id]);

  const handleLogout = () => { logout(); };

  const handleCaptureAttempt = () => {
    setCaptureWarning(true);
    clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setCaptureWarning(false), 4000);
  };

  useAntiCapture({ onAttempt: handleCaptureAttempt });

  const displayLogo = logoUrl || WathbaLogo;

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-white flex-shrink-0 p-0.5">
            <img src={displayLogo} alt={platformName} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl leading-tight">{platformName}</h1>
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
        <style>{EVENTS_NAV_CSS}</style>
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}>
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
        <div style={{ paddingTop: 4 }}>
          <NavLink to="/student/events" className="events-nav-link" onClick={() => setSidebarOpen(false)}>
            <Gamepad2 className="w-5 h-5" style={{ flexShrink: 0, position: 'relative', zIndex: 1 }} />
            <span style={{ position: 'relative', zIndex: 1 }}>الفعاليات 🎮</span>
          </NavLink>
        </div>
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
    <div
      className={`flex h-screen overflow-hidden ${dark ? '' : 'bg-navy-50'}`}
      style={{
        ...(dark ? { backgroundColor: 'var(--dk-bg)' } : {}),
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {captureWarning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', direction: 'rtl',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a0000 0%, #2d0a0a 100%)',
            border: '2px solid rgba(239,68,68,0.6)', borderRadius: '20px',
            padding: '40px 48px', maxWidth: '420px', textAlign: 'center',
            boxShadow: '0 25px 80px rgba(239,68,68,0.3)',
          }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <ShieldAlert style={{ width: 36, height: 36, color: '#ef4444' }} />
            </div>
            <p style={{ color: '#ef4444', fontSize: 20, fontWeight: 900, margin: '0 0 10px' }}>محظور!</p>
            <p style={{ color: '#fca5a5', fontSize: 15, fontWeight: 600, margin: 0, lineHeight: 1.7 }}>
              تسجيل الشاشة والتقاط الصور ممنوع منعاً باتاً على هذه المنصة.
              <br /><span style={{ color: '#f87171', fontSize: 13 }}>سيتم الإبلاغ عن أي محاولة.</span>
            </p>
          </div>
        </div>
      )}

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
          <span className={`text-sm font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-700'}`}>
            مرحباً {user?.name} 👋
          </span>
          <div className="flex items-center gap-1">
            <NotificationBell dark={dark} />
            <button onClick={toggle}
              className={`p-2 rounded-lg transition-all ${dark ? 'text-amber-400 hover:bg-[var(--dk-elevated)]' : 'text-navy-600 hover:bg-gray-100'}`}
              title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}>
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {studentStream && !onLivePage && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0 border-b"
            style={{ backgroundColor: '#7f1d1d', borderColor: 'rgba(239,68,68,0.4)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse flex-shrink-0">
                <Radio className="w-3 h-3" /> متصل
              </span>
              <p className="text-white text-sm font-bold truncate">{studentStream.title}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => navigate('/student/live')}
                className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> العودة للبث
              </button>
              <button onClick={() => leaveStudentStream(studentStream.id)}
                className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
                <StopCircle className="w-3.5 h-3.5" /> مغادرة
              </button>
            </div>
          </div>
        )}

        {availableLive && !studentStream && !onLivePage && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 flex-shrink-0 border-b"
            style={{ backgroundColor: '#1e3a2e', borderColor: 'rgba(34,197,94,0.35)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse flex-shrink-0">
                <Radio className="w-3 h-3" /> بث جديد
              </span>
              <p className="text-green-100 text-sm font-bold truncate">{availableLive.title || 'بث مباشر متاح'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { clearAvailableLive(); navigate('/student/live'); }}
                className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> انضم الآن
              </button>
              <button onClick={clearAvailableLive}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
                <StopCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto"
              style={dark ? { backgroundColor: 'var(--dk-bg)' } : {}}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
