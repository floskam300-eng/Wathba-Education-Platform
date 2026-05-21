import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Settings, Globe, Palette, Image, Save, CheckCircle,
  ExternalLink, Info, RefreshCw, Upload, User
} from 'lucide-react';

const PRESET_COLORS = [
  '#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#84cc16',
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { tenant, tenantLoading } = useTenant();
  const qc = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['teacher-profile'],
    queryFn: () => api.get('/teachers/me').then(r => r.data),
  });

  const [form, setForm] = useState({
    name: '',
    bio: '',
    classification: '',
    whatsapp_phone: '',
    platform_name: '',
    primary_color: '#f97316',
  });

  const [subdomain, setSubdomain] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState(null);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        bio: profile.bio || '',
        classification: profile.classification || '',
        whatsapp_phone: profile.whatsapp_phone || '',
        platform_name: profile.platform_name || '',
        primary_color: profile.primary_color || '#f97316',
      });
      setSubdomain(profile.subdomain || '');
    }
  }, [profile]);

  const profileMutation = useMutation({
    mutationFn: (data) => api.put('/teachers/profile', data).then(r => r.data),
    onSuccess: () => {
      toast.success('تم حفظ الإعدادات بنجاح');
      qc.invalidateQueries({ queryKey: ['teacher-profile'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ'),
  });

  const subdomainMutation = useMutation({
    mutationFn: (sub) => api.put('/teachers/subdomain', { subdomain: sub }).then(r => r.data),
    onSuccess: (data) => {
      toast.success(`تم تفعيل الـ subdomain: ${data.subdomain}`);
      setSubdomainStatus('success');
      qc.invalidateQueries({ queryKey: ['teacher-profile'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'حدث خطأ');
      setSubdomainStatus('error');
    },
  });

  const validateSubdomain = (val) => {
    if (!val) return null;
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(val)) return 'invalid';
    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'wathba', 'support', 'help'];
    if (reserved.includes(val)) return 'reserved';
    return 'ok';
  };

  const handleSubdomainChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(val);
    setSubdomainStatus(null);
  };

  const handleProfileSave = (e) => {
    e.preventDefault();
    profileMutation.mutate(form);
  };

  const handleSubdomainSave = () => {
    const v = validateSubdomain(subdomain);
    if (v === 'invalid') return toast.error('الـ subdomain يجب أن يكون بين 3-30 حرف (أحرف إنجليزية صغيرة وأرقام وشرطة فقط)');
    if (v === 'reserved') return toast.error('هذا الـ subdomain محجوز، اختر اسماً آخر');
    subdomainMutation.mutate(subdomain);
  };

  const subdomainValidation = validateSubdomain(subdomain);
  const isLoading = profileLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentSubdomain = profile?.subdomain;
  const platformUrl = currentSubdomain ? `https://${currentSubdomain}.wathba.app` : null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
          <Settings className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">إعدادات المنصة</h1>
          <p className="text-white/50 text-sm">إدارة هوية منصتك وبياناتك الشخصية</p>
        </div>
      </div>

      {/* ── Section 1: Platform Identity ── */}
      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-5 h-5 text-purple-400" />
          <h2 className="text-white font-black text-lg">هوية المنصة</h2>
        </div>

        {/* Subdomain */}
        <div>
          <label className="text-white/60 text-sm font-semibold block mb-2">
            رابط المنصة المخصص (Subdomain)
          </label>
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <div className="flex items-center border border-white/15 rounded-xl overflow-hidden bg-white/5 focus-within:border-orange-500/50 focus-within:bg-white/[0.07] transition-all">
                <input
                  type="text"
                  value={subdomain}
                  onChange={handleSubdomainChange}
                  placeholder="ahmed"
                  maxLength={30}
                  className="flex-1 bg-transparent text-white px-4 py-3 text-sm outline-none font-mono"
                  dir="ltr"
                />
                <span className="px-3 text-white/30 text-sm font-mono border-r border-white/10 mr-0 bg-white/[0.03]">
                  .wathba.app
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {subdomain && subdomainValidation === 'ok' && (
                  <p className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {subdomain}.wathba.app متاح للحجز
                  </p>
                )}
                {subdomain && subdomainValidation === 'invalid' && (
                  <p className="text-red-400 text-xs">أحرف إنجليزية صغيرة وأرقام وشرطة فقط (3-30 حرف)</p>
                )}
                {subdomain && subdomainValidation === 'reserved' && (
                  <p className="text-red-400 text-xs">هذا الاسم محجوز، اختر اسماً آخر</p>
                )}
                {!subdomain && (
                  <p className="text-white/30 text-xs">مثال: ahmed → ahmed.wathba.app</p>
                )}
              </div>
            </div>
            <button
              onClick={handleSubdomainSave}
              disabled={subdomainMutation.isPending || !subdomain || subdomainValidation !== 'ok'}
              className="px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
            >
              {subdomainMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              تفعيل
            </button>
          </div>
          {currentSubdomain && (
            <div className="mt-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-emerald-300 text-sm font-semibold">منصتك مفعّلة على:</span>
              <a
                href={platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 font-mono text-sm hover:underline flex items-center gap-1"
              >
                {currentSubdomain}.wathba.app
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Platform Name */}
        <div>
          <label className="text-white/60 text-sm font-semibold block mb-2">اسم المنصة</label>
          <input
            type="text"
            value={form.platform_name}
            onChange={e => setForm(p => ({ ...p, platform_name: e.target.value }))}
            placeholder="مثال: منصة أستاذ أحمد — سيظهر بدلاً من &quot;وثبة&quot;"
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
          />
          <p className="text-white/30 text-xs mt-1.5">
            يظهر هذا الاسم في الـ sidebar والصفحة الرئيسية وصفحة تسجيل الدخول
          </p>
        </div>

        {/* Primary Color */}
        <div>
          <label className="text-white/60 text-sm font-semibold block mb-3">لون المنصة الرئيسي</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setForm(p => ({ ...p, primary_color: color }))}
                className="w-9 h-9 rounded-xl border-2 transition-all duration-150 hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: form.primary_color === color ? '#fff' : 'transparent',
                  boxShadow: form.primary_color === color ? `0 0 0 2px ${color}80` : 'none',
                }}
              />
            ))}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                className="w-9 h-9 rounded-xl cursor-pointer border border-white/20"
                title="اختر لوناً مخصصاً"
              />
              <span className="text-white/40 text-xs font-mono">{form.primary_color}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0"
              style={{ backgroundColor: form.primary_color }}
            />
            <span className="text-white/50 text-xs">معاينة اللون — سيُطبَّق على الأزرار والتمييز</span>
          </div>
        </div>
      </section>

      {/* ── Section 2: Personal Info ── */}
      <form onSubmit={handleProfileSave}>
        <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-5 h-5 text-orange-400" />
            <h2 className="text-white font-black text-lg">بياناتك الشخصية</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-sm font-semibold block mb-2">الاسم الكامل</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
                required
              />
            </div>
            <div>
              <label className="text-white/60 text-sm font-semibold block mb-2">التخصص / المادة</label>
              <input
                type="text"
                value={form.classification}
                onChange={e => setForm(p => ({ ...p, classification: e.target.value }))}
                placeholder="مثال: معلم رياضيات — الثانوية العامة"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-white/60 text-sm font-semibold block mb-2">نبذة عنك</label>
            <textarea
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              rows={3}
              placeholder="اكتب نبذة تعريفية تظهر في الصفحة الرئيسية لمنصتك..."
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all resize-none"
            />
          </div>

          <div>
            <label className="text-white/60 text-sm font-semibold block mb-2">رقم الواتساب</label>
            <input
              type="text"
              value={form.whatsapp_phone}
              onChange={e => setForm(p => ({ ...p, whatsapp_phone: e.target.value }))}
              placeholder="01xxxxxxxxx"
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
              dir="ltr"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={profileMutation.isPending}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25"
            >
              {profileMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              حفظ التغييرات
            </button>
          </div>
        </section>
      </form>

      {/* ── Section 3: Info box ── */}
      <div className="flex items-start gap-3 bg-blue-500/8 border border-blue-500/20 rounded-2xl p-4">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-blue-300/80 text-sm leading-relaxed">
          <p className="font-bold text-blue-300 mb-1">كيف يعمل الـ SaaS Subdomain؟</p>
          <p>
            عند تفعيل الـ subdomain، تحصل على رابط خاص مثل{' '}
            <code className="bg-blue-500/15 px-1.5 py-0.5 rounded text-blue-200 font-mono text-xs">
              ahmed.wathba.app
            </code>
            — طلابك يدخلون عبر هذا الرابط ويرون منصتك باسمك ولوجوك وألوانك فقط.
            كل بياناتك وطلابك مستقلون تماماً عن المعلمين الآخرين.
          </p>
        </div>
      </div>
    </div>
  );
}
