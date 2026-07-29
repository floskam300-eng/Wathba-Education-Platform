import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import ImageCropper from '../../components/ImageCropper';
import DirectImageUploader from '../../components/DirectImageUploader';
import { ArrowRight, Save, Phone, User, Sparkles, Plus, Trash2, KeyRound, Eye, EyeOff, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  // Teacher fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [classification, setClassification] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [bioHero, setBioHero] = useState('');
  const [bioAbout, setBioAbout] = useState('');
  const [bioCard, setBioCard] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [platformName, setPlatformName] = useState('');
  const [pwaName, setPwaName] = useState('');

  // Subdomain slug — separate from username in create mode
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Auto-derive slug preview from username unless user manually changed it
  // Final normalization (used on submit and for preview)
  const normalizeSlug = (v) =>
    v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Loose normalization while typing — strips invalid chars but keeps trailing dash
  // so the user can type "mr-youssef" without the dash disappearing mid-word
  const normalizeSlugTyping = (v) =>
    v.toLowerCase().replace(/[^a-z0-9-_]/g, '').replace(/_/g, '-');

  const handleUsernameChange = (v) => {
    setUsername(v);
    if (!slugManuallyEdited) {
      setSlug(normalizeSlug(v));
    }
  };

  const handleSlugChange = (v) => {
    setSlugManuallyEdited(true);
    setSlug(normalizeSlugTyping(v));
  };

  const handleSlugBlur = () => {
    // On blur, apply full normalization (strip leading/trailing dashes)
    setSlug(prev => normalizeSlug(prev));
  };

  const previewSlug = normalizeSlug(slug) || 'subdomain';

  // Subscriptions setup (only when creating)
  const [plans, setPlans] = useState([]);
  const [selectedPlanIds, setSelectedPlanIds] = useState(new Set());

  // Support Team Members
  const [team, setTeam] = useState([]);
  // In create mode, pendingTeam holds members queued locally before the teacher exists
  const [pendingTeam, setPendingTeam] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberPhoto, setNewMemberPhoto] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberOrder, setNewMemberOrder] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        if (!isEdit) {
          const res = await api.get('/plans');
          const activePlans = res.data.plans.filter((p) => p.is_active);
          setPlans(activePlans);
          const firstPlatform = activePlans.find((p) => p.category === 'platform');
          if (firstPlatform) setSelectedPlanIds(new Set([String(firstPlatform.id)]));
        } else {
          const res = await api.get(`/teachers/${id}`);
          const { teacher } = res.data;
          setName(teacher.name);
          setUsername(teacher.username);
          setSlug(teacher.slug || teacher.username || '');
          setClassification(teacher.classification || '');
          setWhatsappPhone(teacher.whatsapp_phone || '');
          const legacyBio = teacher.bio || '';
          setBioHero(teacher.bio_hero || legacyBio);
          setBioAbout(teacher.bio_about || legacyBio);
          setBioCard(teacher.bio_card || legacyBio);
          setLogoUrl(teacher.logo_url || '');
          setPhotoUrl(teacher.photo_url || '');
          setBackgroundImageUrl(teacher.background_image_url || '');
          setPlatformName(teacher.platform_name || '');
          setPwaName(teacher.pwa_name || '');

          const teamRes = await api.get(`/teachers/${id}/team`);
          setTeam(teamRes.data.team);
        }
      } catch (err) {
        console.error(err);
        toast.error('حدث خطأ أثناء تحميل البيانات');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isEdit]);

  const togglePlan = (planId) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || (!isEdit && (!username || !password || selectedPlanIds.size === 0))) {
      return toast.error('يرجى ملء جميع الحقول المطلوبة، ويجب اختيار باقة واحدة على الأقل');
    }
    // Validate WhatsApp phone on create
    if (!isEdit && !whatsappPhone.trim()) {
      return toast.error('رقم الهاتف (الواتساب) مطلوب');
    }
    // Password strength validation
    if (!isEdit && password.length < 8) {
      return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    }

    setSaving(true);
    try {
      if (!isEdit) {
        const createRes = await api.post('/teachers', {
          username,
          slug: slug || username,
          password,
          name,
          classification,
          whatsapp_phone: whatsappPhone,
          bio: bioHero,
          bio_hero: bioHero,
          bio_about: bioAbout,
          bio_card: bioCard,
          platform_name: platformName || null,
          logo_url: logoUrl,
          photo_url: photoUrl,
          background_image_url: backgroundImageUrl,
          pwa_name: pwaName || null,
          plan_ids: Array.from(selectedPlanIds).map(Number),
          force_password_change: forcePasswordChange,
        });
        const newTeacherId = createRes.data?.teacherId;
        // Submit any pending team members that were queued during create
        if (newTeacherId && pendingTeam.length > 0) {
          await Promise.allSettled(
            pendingTeam.map(({ _tempId: _ignored, ...m }) =>
              api.post(`/teachers/${newTeacherId}/team`, m)
            )
          );
        }
        toast.success('تم إنشاء حساب المدرس والمنصة بنجاح!');
        navigate('/teachers');
      } else {
        await api.put(`/teachers/${id}`, {
          name,
          classification,
          whatsapp_phone: whatsappPhone,
          bio: bioHero,
          bio_hero: bioHero,
          bio_about: bioAbout,
          bio_card: bioCard,
          platform_name: platformName || null,
          logo_url: logoUrl,
          photo_url: photoUrl,
          background_image_url: backgroundImageUrl,
          pwa_name: pwaName,
        });
        toast.success('تم تحديث بيانات المدرس بنجاح');
        navigate('/teachers');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  // Support Team Actions
  const handleAddTeamMember = async () => {
    if (!newMemberName) return toast.error('اسم العضو مطلوب');
    const memberData = {
      name: newMemberName,
      role_title: newMemberRole,
      photo_url: newMemberPhoto,
      whatsapp_phone: newMemberPhone,
      display_order: newMemberOrder,
    };
    const clearInputs = () => {
      setNewMemberName('');
      setNewMemberRole('');
      setNewMemberPhoto('');
      setNewMemberPhone('');
      setNewMemberOrder(0);
    };

    if (!isEdit) {
      // In create mode: queue locally, will be submitted after teacher is created
      setPendingTeam(prev =>
        [...prev, { ...memberData, _tempId: Date.now() }]
          .sort((a, b) => a.display_order - b.display_order)
      );
      toast.success('تم إضافة العضو - سيتم حفظه عند إنشاء المدرس');
      clearInputs();
      return;
    }

    try {
      const res = await api.post(`/teachers/${id}/team`, memberData);
      setTeam(prev =>
        [...prev, { ...memberData, id: res.data.memberId }]
          .sort((a, b) => a.display_order - b.display_order)
      );
      toast.success('تم إضافة عضو فريق الدعم');
      clearInputs();
    } catch (err) {
      console.error(err);
      toast.error('فشل إضافة عضو فريق الدعم');
    }
  };

  const handleDeleteTeamMember = async (memberId) => {
    if (!isEdit) {
      setPendingTeam(prev => prev.filter(m => m._tempId !== memberId));
      return;
    }
    try {
      await api.delete(`/teachers/${id}/team/${memberId}`);
      setTeam(team.filter((m) => m.id !== memberId));
      toast.success('تم حذف عضو فريق الدعم');
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف عضو فريق الدعم');
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/teachers" className="text-slate-400 hover:text-white transition">
          <ArrowRight size={24} />
        </Link>
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-white font-cairo">
            {isEdit ? 'تعديل بيانات المدرس' : 'إضافة مدرس جديد'}
          </h1>
          <p className="text-slate-400 mt-1 font-cairo">
            {isEdit
              ? 'تعديل بيانات الحساب وتخصيص المنصة والموقع'
              : 'إنشاء حساب مدرس جديد وتعيين باقة الاشتراك وضبط النطاق الفرعي'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Section 1: Account Info ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
            <User className="text-amber-500" size={20} />
            <span>بيانات الحساب الأساسية</span>
          </h3>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Full name */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="fullName">
                الاسم بالكامل *
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أحمد محمد علي"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500 font-cairo">اسم المدرس الشخصي — لا يظهر كاسم المنصة</p>
            </div>

            {/* Platform name */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="platformName">
                اسم المنصة *
              </label>
              <input
                id="platformName"
                type="text"
                maxLength={100}
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="منصة أ.أحمد التعليمية"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500 font-cairo">الاسم اللي بيظهر للطلاب وعند تنزيل التطبيق على الهاتف</p>
            </div>

            {/* Username (login) */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="teacherUsername">
                اسم المستخدم (للدخول) *
              </label>
              <input
                id="teacherUsername"
                type="text"
                required
                disabled={isEdit}
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="mr-ahmed"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none disabled:opacity-50 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500 font-cairo">
                يُستخدم فقط لتسجيل الدخول — لا يظهر للطلاب
              </p>
            </div>

            {/* Subdomain slug — create mode only (editable), edit mode shows read-only */}
            {!isEdit ? (
              <div>
                <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="teacherSlug">
                  النطاق الفرعي (رابط المنصة) *
                </label>
                <input
                  id="teacherSlug"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  onBlur={handleSlugBlur}
                  placeholder="mr-ahmed"
                  className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none font-mono text-sm"
                />
                <p className="mt-1 text-xs text-slate-500 font-cairo">
                  رابط منصة المدرس:{' '}
                  <span className="font-mono text-amber-500">{previewSlug}.wathba.site</span>
                  {!slugManuallyEdited && slug && (
                    <span className="text-slate-600"> (مولّد تلقائياً)</span>
                  )}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-300 font-cairo">
                  النطاق الفرعي الفعلي
                </label>
                <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900 py-3 px-4 font-mono text-sm text-amber-400 select-all">
                  {slug}.wathba.site
                </div>
              </div>
            )}

            {/* Password (create only) */}
            {!isEdit && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="teacherPassword">
                  كلمة المرور * (8 أحرف على الأقل)
                </label>
                <div className="relative">
                  <input
                    id="teacherPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pr-4 pl-11 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forcePasswordChange}
                    onChange={(e) => setForcePasswordChange(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm text-slate-400 font-cairo">
                    إجبار المدرس على تغيير كلمة المرور عند أول تسجيل دخول
                  </span>
                </label>
              </div>
            )}

            {/* WhatsApp Phone */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="phone">
                رقم الهاتف (الواتساب) *
              </label>
              <div className="relative mt-2">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                  <Phone size={18} />
                </span>
                <input
                  id="phone"
                  type="text"
                  required={!isEdit}
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="+201000000000"
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pr-10 pl-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none text-sm"
                />
              </div>
            </div>

            {/* Classification */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="classification">
                التخصص العلمي / الوصف التعليمي
              </label>
              <input
                id="classification"
                type="text"
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                placeholder="مدرس رياضيات للمرحلة الثانوية"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Landing bios */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-amber-400 font-cairo">نبذات صفحة الـ Landing</h4>
              <p className="mt-1 text-xs text-slate-500 font-cairo">
                اكتب نبذة مستقلة لكل مكان؛ ستظهر تلقائيًا في المواضع الموضحة أسفل كل حقل.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="bio-hero">
                النبذة التعريفية الرئيسية — أعلى الصفحة
              </label>
              <textarea
                id="bio-hero"
                rows="3"
                value={bioHero}
                onChange={(e) => setBioHero(e.target.value)}
                placeholder="تظهر تحت اسم المدرس في الـ Hero..."
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none resize-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="bio-about">
                نبذة «من أنا؟»
              </label>
              <textarea
                id="bio-about"
                rows="3"
                value={bioAbout}
                onChange={(e) => setBioAbout(e.target.value)}
                placeholder="تظهر في بطاقة من أنا؟ داخل قسم عن المعلم..."
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none resize-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="bio-card">
                نبذة بطاقة المدرس — تحت الصورة
              </label>
              <textarea
                id="bio-card"
                rows="3"
                value={bioCard}
                onChange={(e) => setBioCard(e.target.value)}
                placeholder="تظهر تحت الصورة الصغيرة في بطاقة المدرس..."
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none resize-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* ── Section 2: Plan Selection (create only) ── */}
        {!isEdit && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
            <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
              <Sparkles className="text-amber-500" size={20} />
              <span>باقات الاشتراك للمنصة</span>
            </h3>

            {plans.length === 0 ? (
              <p className="text-sm text-slate-500 font-cairo">لا توجد باقات مفعلة بالمنصة حالياً.</p>
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-slate-400 font-cairo">
                  يمكنك اختيار أكثر من باقة للمدرس (باقة المنصة + خدمات إضافية). يجب اختيار باقة واحدة على الأقل. *
                </p>
                {[
                  { key: 'platform',     label: 'باقات استضافة المنصة',   color: 'text-amber-400',  border: 'border-amber-500/30'  },
                  { key: 'service',      label: 'خدمات الإنتاج والتصميم', color: 'text-sky-400',    border: 'border-sky-500/30'    },
                  { key: 'social_media', label: 'إدارة السوشيال ميديا',   color: 'text-purple-400', border: 'border-purple-500/30' },
                ]
                  .filter(({ key }) => plans.some((p) => p.category === key))
                  .map(({ key, label, color, border }) => (
                    <div key={key} className={`rounded-xl border ${border} bg-slate-950/40 p-4 space-y-3`}>
                      <h4 className={`text-xs font-bold font-cairo uppercase tracking-wide ${color}`}>{label}</h4>
                      <div className="space-y-2">
                        {plans.filter((p) => p.category === key).map((p) => {
                          const checked = selectedPlanIds.has(String(p.id));
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition ${
                                checked ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePlan(String(p.id))}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-white text-sm font-cairo">{p.name}</div>
                                {p.description && (
                                  <div className="text-xs text-slate-500 font-cairo mt-0.5 truncate">{p.description}</div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-sm font-bold text-amber-400 font-mono">{p.price} EGP</div>
                                <div className="text-[10px] text-slate-500 font-cairo">
                                  {p.billing_type === 'monthly' ? 'شهري' : p.billing_type === 'annual' ? 'سنوي' : 'مرة واحدة'}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                {selectedPlanIds.size > 0 && (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-cairo">
                      إجمالي الباقات المحددة: <span className="text-white font-semibold">{selectedPlanIds.size} باقة</span>
                    </span>
                    <span className="text-sm font-bold text-amber-400 font-mono">
                      {plans
                        .filter((p) => selectedPlanIds.has(String(p.id)))
                        .reduce((sum, p) => sum + Number(p.price), 0)
                        .toLocaleString()} EGP / شهر
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Section 3: Branding ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} />
            <span>التخصيص الاحترافي (Branding)</span>
          </h3>

          {/* ── PWA Name ── */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Info size={15} className="text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 font-cairo leading-relaxed">
                <span className="text-white font-semibold">اسم التطبيق على الهاتف</span> — هو الاسم اللي بيظهر تحت أيقونة المنصة لما الطالب ينزّلها على هاتفه (iOS أو Android). يُفضل يكون قصير (12 حرف أو أقل) عشان مايتقطعش على الشاشة.
                لو تركته فاضي، هيستخدم اسم المنصة الكامل تلقائياً.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="pwaName">
                اسم التطبيق على الهاتف (PWA Short Name)
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="pwaName"
                  type="text"
                  maxLength={50}
                  value={pwaName}
                  onChange={(e) => setPwaName(e.target.value)}
                  placeholder="مثال: أ.أحمد، رياضيات أحمد"
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-green-500 focus:outline-none text-sm"
                />
                {pwaName && (
                  <div className="flex-shrink-0 text-center">
                    <div className="w-16 flex flex-col items-center gap-1">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <span className="text-lg">📱</span>
                      </div>
                      <span className="text-[10px] text-slate-300 font-cairo text-center leading-tight max-w-[64px] break-words">
                        {pwaName.length > 12 ? pwaName.slice(0, 12) + '…' : pwaName}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-1 font-cairo">معاينة</p>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-500 font-cairo">
                {pwaName.length}/50 حرف
                {pwaName.length > 12 && (
                  <span className="text-yellow-500 mr-2">⚠ أطول من 12 حرف — قد يُقطع على بعض الهواتف</span>
                )}
              </p>
            </div>
          </div>

          {/* ── Logo row ── */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Info size={15} className="text-sky-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 font-cairo leading-relaxed">
                <span className="text-white font-semibold">الشعار المربع</span> يُستخدم كأيقونة تطبيق على الهاتف (PWA) وكـ favicon في المتصفح.
                {' '}<span className="text-white font-semibold">الشعار العريض</span> يظهر في شريط التنقل العلوي (Navbar) عند فتح المنصة على الكمبيوتر أو المتصفح — لو لم يُرفع يُستخدم الشعار المربع بدلاً منه.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <ImageCropper
                aspect={1}
                onComplete={(url) => setLogoUrl(url)}
                label="الشعار المربع — أيقونة التطبيق / Favicon (1:1)"
                currentImage={logoUrl}
                circular={false}
              />
            </div>
          </div>

          {/* ── Teacher personal photo row ── */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Info size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 font-cairo leading-relaxed">
                <span className="text-white font-semibold">الصورة الشخصية للمدرس</span> تظهر في الصفحة الرئيسية (Landing Page) للمنصة في قسم Hero وقسم "عن المعلم".
                الصورة تُعرض بنسبها الأصلية — بورتريه أو مربع أو أفقي — دون قص إجباري.
              </p>
            </div>
            <DirectImageUploader
              onComplete={(url) => setPhotoUrl(url)}
              onUploadingChange={(v) => setPhotoUploading(v)}
              label="الصورة الشخصية للمدرس (تُعرض في Landing Page)"
              currentImage={photoUrl}
            />
          </div>

          {/* ── Landing page background row ── */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Info size={15} className="text-violet-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 font-cairo leading-relaxed">
                <span className="text-white font-semibold">خلفية الصفحة الرئيسية</span> تظهر خلف قسم الـ Hero في Landing Page الخاصة بالمدرس.
                ارفع صورة أفقية أو كبيرة للحصول على أفضل نتيجة؛ سيتم عرضها كخلفية مع طبقة شفافة للحفاظ على وضوح النص.
              </p>
            </div>
            <DirectImageUploader
              onComplete={(url) => setBackgroundImageUrl(url)}
              onUploadingChange={(v) => setBackgroundUploading(v)}
              label="صورة خلفية Landing Page"
              currentImage={backgroundImageUrl}
            />
          </div>

        </div>

        {/* ── Section 4: Support Team ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} />
            <span>فريق الدعم والمسؤولين (يعرض في الموقع التعريفي)</span>
          </h3>

          {/* List of existing/pending members */}
          <div className="space-y-3">
            {(isEdit ? team : pendingTeam).length === 0 ? (
              <p className="text-sm text-slate-500 font-cairo">لم يتم إضافة أي أعضاء لفريق الدعم بعد.</p>
            ) : (
              (isEdit ? team : pendingTeam).map((member) => (
                <div key={isEdit ? member.id : member._tempId} className="flex items-center justify-between border border-slate-800 bg-slate-950/40 p-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    <img
                      src={member.photo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name) + '&background=f59e0b&color=fff'}
                      alt={member.name}
                      className="h-10 w-10 rounded-full object-cover border border-slate-800"
                    />
                    <div>
                      <div className="font-semibold text-white font-cairo">{member.name}</div>
                      <div className="text-xs text-slate-500 font-cairo">
                        {member.role_title || 'مسؤول دعم'} | هاتف: {member.whatsapp_phone || 'لا يوجد'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">ترتيب: {member.display_order}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTeamMember(isEdit ? member.id : member._tempId)}
                      className="rounded-lg bg-red-950/40 p-2 text-red-400 hover:bg-red-900/60 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add new member inputs */}
          <div className="border-t border-slate-800 pt-6 space-y-4">
            <h4 className="text-sm font-semibold text-white font-cairo">إضافة عضو جديد للفريق:</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <input
                type="text"
                placeholder="الاسم"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-cairo"
              />
              <input
                type="text"
                placeholder="المسمى الوظيفي (دعم فني)"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-cairo"
              />
              <input
                type="text"
                placeholder="هاتف الواتس الخاص به"
                value={newMemberPhone}
                onChange={(e) => setNewMemberPhone(e.target.value)}
                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-mono"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="الترتيب"
                  value={newMemberOrder}
                  onChange={(e) => setNewMemberOrder(parseInt(e.target.value) || 0)}
                  className="block w-16 rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-2 text-white text-center focus:outline-none text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddTeamMember}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-semibold text-white hover:bg-amber-600 transition font-cairo px-3"
                >
                  <Plus size={14} />
                  <span>إضافة</span>
                </button>
              </div>
            </div>
            <div className="w-full">
              <ImageCropper
                aspect={1}
                circular={true}
                onComplete={(url) => setNewMemberPhoto(url)}
                label="صورة العضو الشخصية (قص دائري 1:1)"
                currentImage={newMemberPhoto}
              />
            </div>
          </div>
        </div>

        {/* ── Section 5: Reset Password (edit only) ── */}
        {isEdit && <ResetPasswordSection teacherId={id} />}

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link
            to="/teachers"
            className="rounded-xl bg-slate-900 border border-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition font-cairo"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={saving || photoUploading || backgroundUploading}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition disabled:opacity-50 font-cairo"
          >
            <Save size={16} />
            <span>
              {saving
                ? 'جاري الحفظ...'
                : photoUploading || backgroundUploading
                  ? 'جاري رفع الصورة...'
                  : 'حفظ البيانات'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Reset Password Section ── */
function ResetPasswordSection({ teacherId }) {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forceChange, setForceChange] = useState(true);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!newPassword || newPassword.length < 8) {
      return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    }
    if (!window.confirm('هل أنت متأكد من تغيير كلمة مرور المدرس؟')) return;
    setResetting(true);
    try {
      await api.post(`/teachers/${teacherId}/reset-password`, {
        new_password: newPassword,
        force_password_change: forceChange,
      });
      toast.success('تم تغيير كلمة المرور بنجاح');
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل تغيير كلمة المرور');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-6 space-y-4">
      <h3 className="text-lg font-bold text-white font-cairo border-b border-red-900/30 pb-3 flex items-center gap-2">
        <KeyRound className="text-red-400" size={20} />
        <span>إعادة تعيين كلمة المرور</span>
      </h3>
      <p className="text-sm text-slate-400 font-cairo">
        تغيير كلمة مرور المدرس مباشرة من لوحة الإدارة دون الحاجة لكلمة المرور القديمة.
      </p>
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-sm font-semibold text-slate-300 font-cairo mb-2">
            كلمة المرور الجديدة (8 أحرف على الأقل)
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pr-4 pl-11 text-white placeholder-slate-600 focus:border-red-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={resetting}
          onClick={handleReset}
          className="flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-600 transition disabled:opacity-50 font-cairo flex-shrink-0"
        >
          <KeyRound size={15} />
          <span>{resetting ? 'جاري التغيير...' : 'تغيير الباسورد'}</span>
        </button>
      </div>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={forceChange}
          onChange={(e) => setForceChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-red-500 focus:ring-red-500"
        />
        <span className="text-sm text-slate-400 font-cairo">
          إجبار المدرس على تغيير كلمة المرور عند أول تسجيل دخول
        </span>
      </label>
    </div>
  );
}
