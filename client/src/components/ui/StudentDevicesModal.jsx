import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Monitor, Smartphone, Tablet, Wifi, WifiOff, Clock,
  Globe, ShieldCheck, AlertTriangle, RefreshCw, X,
} from 'lucide-react';
import api from '../../lib/api';

const fmtDt = (d) => d ? new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const KICK_REASON_LABELS = {
  new_login_replaced_session: { text: 'استُبدلت بدخول جديد', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  student_logout:              { text: 'خرج الطالب',            cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  teacher_suspended_account:   { text: 'أوقف المدرس الحساب',    cls: 'bg-red-100 text-red-700 border-red-200' },
  teacher_removed_device:      { text: 'أزال المدرس الجهاز',    cls: 'bg-red-100 text-red-700 border-red-200' },
  teacher_kicked_session:      { text: 'طرد المدرس الجلسة',     cls: 'bg-red-100 text-red-700 border-red-200' },
  teacher_kept_original_device:{ text: 'أبقى المدرس على الأصلي',cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  session_kicked:              { text: 'تم إنهاء الجلسة',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ORIGIN_LABELS = {
  browser:     { text: 'متصفح',     cls: 'bg-blue-100 text-blue-700' },
  pwa_ios:     { text: 'تطبيق iOS', cls: 'bg-purple-100 text-purple-700' },
  pwa_android: { text: 'تطبيق Android', cls: 'bg-emerald-100 text-emerald-700' },
  twa:         { text: 'تطبيق TWA', cls: 'bg-orange-100 text-orange-700' },
  unknown:     { text: 'غير معروف', cls: 'bg-gray-100 text-gray-600' },
};

function deviceIcon(deviceName) {
  if (/iPad|Tab|Tablet/i.test(deviceName || '')) return Tablet;
  if (/Android|iOS|iPhone|Samsung|Xiaomi|Redmi|POCO|Oppo|Realme|Infinix|Tecno|Vivo|Huawei|Honor|Pixel/i.test(deviceName || '')) return Smartphone;
  return Monitor;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'الآن';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `قبل ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `قبل ${days} يوم`;
}

function OriginPill({ origin }) {
  const o = ORIGIN_LABELS[origin] || ORIGIN_LABELS.unknown;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-current/20 ${o.cls}`}>{o.text}</span>;
}

function Section({ title, icon: Icon, iconBg, iconColor, count, badge, children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-100/70 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <span className="font-black text-gray-800 text-sm">{title}</span>
          {count !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge || 'bg-white border border-gray-200 text-gray-500'}`}>
              {count}
            </span>
          )}
        </div>
        {open
          ? <span className="text-xs text-gray-400">إخفاء</span>
          : <span className="text-xs text-gray-400">عرض</span>}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function StudentDevicesModal({ studentId, studentName, onClose }) {
  const { data, isLoading, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['student-devices-overview', studentId],
    queryFn: () => api.get(`/students/${studentId}/devices-overview`).then(r => r.data),
    enabled: !!studentId,
    refetchInterval: 15_000,
    staleTime: 0,
  });

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const registeredDevices = data?.registeredDevices || [];
  const activeSessions    = data?.activeSessions || [];
  const recentLogins      = data?.recentLogins || [];

  // The "last activity" badge turns green if any active session was active in
  // the last 2 minutes — gives teachers an instant "live" feel without needing
  // an SSE channel for this view.
  const isLive = useMemo(() => {
    if (!activeSessions.length) return false;
    return activeSessions.some(s => Date.now() - new Date(s.last_active_at).getTime() < 2 * 60_000);
  }, [activeSessions]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box w-full max-w-2xl flex flex-col max-h-[90vh] mx-2 sm:mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy-600 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-navy-500">
                الأجهزة والدخول — {studentName || '—'}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {dataUpdatedAt ? `آخر تحديث: ${new Date(dataUpdatedAt).toLocaleTimeString('ar-EG')}` : 'يتم التحديث تلقائياً كل 15 ثانية'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="تحديث"
              title="تحديث"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {isLoading && !data ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 mx-auto text-red-300 mb-3" />
              <p className="text-gray-500 font-semibold">تعذّر تحميل بيانات الأجهزة</p>
            </div>
          ) : (
            <>
              {/* ── Section A: currently open sessions ── */}
              <Section
                title="الأجهزة المفتوحة الآن"
                icon={isLive ? Wifi : WifiOff}
                iconBg={isLive ? 'bg-emerald-100' : 'bg-gray-100'}
                iconColor={isLive ? 'text-emerald-600' : 'text-gray-500'}
                count={activeSessions.length}
                badge={isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}
                defaultOpen
              >
                {activeSessions.length === 0 ? (
                  <div className="text-center py-6">
                    <ShieldCheck className="w-10 h-10 mx-auto text-emerald-300 mb-2" />
                    <p className="text-sm font-bold text-gray-500">لا توجد أجهزة مفتوحة حالياً</p>
                    <p className="text-[11px] text-gray-400 mt-1">الطالب غير متصل بأي جهاز في الوقت الحالي</p>
                  </div>
                ) : activeSessions.map((s) => {
                  const Icon = deviceIcon(s.device_name);
                  return (
                    <div key={s.session_id}
                      className="flex items-center gap-3 p-3 mb-2 last:mb-0 bg-white rounded-xl border border-gray-100">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-navy-700 truncate">{s.device_name || 'جهاز غير معروف'}</p>
                          <OriginPill origin={s.device_origin} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
                          {s.ip_address && <span className="font-mono">IP: {s.ip_address}</span>}
                          {s.user_agent && (
                            <span className="truncate max-w-[14rem]" title={s.user_agent}>
                              {s.user_agent.split(' ').slice(-1)[0]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> آخر نشاط: {timeAgo(s.last_active_at)}
                          </span>
                          <span>دخل في: {fmtDt(s.logged_in_at)}</span>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        نشطة
                      </span>
                    </div>
                  );
                })}
              </Section>

              {/* ── Section B: registered devices ── */}
              <Section
                title="الأجهزة المسجّلة"
                icon={Monitor}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                count={registeredDevices.length}
                defaultOpen
              >
                {registeredDevices.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm font-medium py-4">لم يُسجَّل أي جهاز بعد</p>
                ) : registeredDevices.map((d, i) => {
                  const Icon = deviceIcon(d.device_name);
                  const isActive = activeSessions.some(s => s.device_id === d.device_id);
                  return (
                    <div key={d.id || d.device_id}
                      className="flex items-center gap-3 p-3 mb-2 last:mb-0 bg-white rounded-xl border border-gray-100">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                        <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-blue-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-navy-700 truncate">{d.device_name || 'جهاز غير معروف'}</p>
                          <OriginPill origin={d.device_origin} />
                          {isActive && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              متصل الآن
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
                          <span>أول دخول: {fmtDay(d.first_seen)}</span>
                          <span>آخر دخول: {fmtDay(d.last_seen)}</span>
                          {d.ip_address && <span className="font-mono">IP: {d.ip_address}</span>}
                        </div>
                      </div>
                      <span className="text-xs bg-navy-100 text-navy-700 font-black px-2 py-0.5 rounded-full flex-shrink-0">
                        جهاز {i + 1}
                      </span>
                    </div>
                  );
                })}
              </Section>

              {/* ── Section C: recent logins ── */}
              <Section
                title="آخر تسجيلات الدخول"
                icon={Globe}
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
                count={recentLogins.length}
                defaultOpen={false}
              >
                {recentLogins.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm font-medium py-4">لا يوجد سجل دخول</p>
                ) : recentLogins.map((s) => {
                  const isKicked = !!s.kicked_at;
                  const reasonInfo = isKicked ? (KICK_REASON_LABELS[s.kicked_reason] || KICK_REASON_LABELS.session_kicked) : null;
                  return (
                    <div key={s.session_id}
                      className="flex items-center gap-3 p-3 mb-2 last:mb-0 bg-white rounded-xl border border-gray-100">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isKicked ? 'bg-gray-50' : 'bg-emerald-50'}`}>
                        <Globe className={`w-4 h-4 ${isKicked ? 'text-gray-400' : 'text-emerald-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-800 truncate">
                          {s.device_name || 'جهاز غير معروف'}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                          <span>دخل: {fmtDt(s.logged_in_at)}</span>
                          {s.kicked_at && <span>خرج: {fmtDt(s.kicked_at)}</span>}
                          {s.ip_address && <span className="font-mono">{s.ip_address}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {!isKicked ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            نشطة
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${reasonInfo.cls}`}>
                            {reasonInfo.text}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}