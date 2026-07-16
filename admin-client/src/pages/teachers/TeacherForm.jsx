import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import ImageCropper from '../../components/ImageCropper';
import { ArrowRight, Save, Phone, User, Sparkles, Plus, Trash2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  // Teacher fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [classification, setClassification] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [bio, setBio] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#0B0F19');

  // BUG-3 FIX: compute the normalized slug exactly as the server does
  const previewSlug = username.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'username';

  // Actual subdomain slug (edit mode — may differ from username)
  const [slug, setSlug] = useState('');

  // Subscriptions setup (only when creating)
  const [plans, setPlans] = useState([]);
  // Multi-plan selection: Set of plan IDs (strings)
  const [selectedPlanIds, setSelectedPlanIds] = useState(new Set());

  // Support Team Members (only when editing)
  const [team, setTeam] = useState([]);
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
          // Fetch plans to select one or more for the new teacher
          const res = await api.get('/plans');
          const activePlans = res.data.plans.filter((p) => p.is_active);
          setPlans(activePlans);
          // Pre-select the first platform plan by default
          const firstPlatform = activePlans.find((p) => p.category === 'platform');
          if (firstPlatform) setSelectedPlanIds(new Set([String(firstPlatform.id)]));
        } else {
          // Fetch existing teacher details
          const res = await api.get(`/teachers/${id}`);
          const { teacher } = res.data;
          setName(teacher.name);
          setUsername(teacher.username);
          setSlug(teacher.slug || teacher.username || '');
          setClassification(teacher.classification || '');
          setWhatsappPhone(teacher.whatsapp_phone || '');
          setBio(teacher.bio || '');
          setLogoUrl(teacher.logo_url || '');
          setHeroImageUrl(teacher.hero_image_url || '');
          setBackgroundColor(teacher.background_color || '#0B0F19');

          // Fetch team members
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
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || (!isEdit && (!username || !password || selectedPlanIds.size === 0))) {
      return toast.error('يرجى ملء جميع الحقول المطلوبة، ويجب اختيار باقة واحدة على الأقل');
    }

    setSaving(true);
    try {
      if (!isEdit) {
        // Create teacher
        await api.post('/teachers', {
          username,
          password,
          name,
          classification,
          whatsapp_phone: whatsappPhone,
          bio,
          logo_url: logoUrl,
          hero_image_url: heroImageUrl,
          background_color: backgroundColor,
          plan_ids: Array.from(selectedPlanIds).map(Number),
          force_password_change: forcePasswordChange,
        });
        toast.success('تم إنشاء حساب المدرس والمنصة بنجاح!');
      } else {
        // Update teacher
        await api.put(`/teachers/${id}`, {
          name,
          classification,
          whatsapp_phone: whatsappPhone,
          bio,
          logo_url: logoUrl,
          hero_image_url: heroImageUrl,
          background_color: backgroundColor,
        });
        toast.success('تم تحديث بيانات المدرس بنجاح');
      }
      navigate('/teachers');
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
    try {
      const res = await api.post(`/teachers/${id}/team`, {
        name: newMemberName,
        role_title: newMemberRole,
        photo_url: newMemberPhoto,
        whatsapp_phone: newMemberPhone,
        display_order: newMemberOrder,
      });

      setTeam([
        ...team,
        {
          id: res.data.memberId,
          name: newMemberName,
          role_title: newMemberRole,
          photo_url: newMemberPhoto,
          whatsapp_phone: newMemberPhone,
          display_order: newMemberOrder,
        },
      ].sort((a, b) => a.display_order - b.display_order));

      toast.success('تم إضافة عضو فريق الدعم');
      setNewMemberName('');
      setNewMemberRole('');
      setNewMemberPhoto('');
      setNewMemberPhone('');
      setNewMemberOrder(0);
    } catch (err) {
      console.error(err);
      toast.error('فشل إضافة عضو فريق الدعم');
    }
  };

  const handleDeleteTeamMember = async (memberId) => {
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
          <h1 className="text-3xl font-bold text-white font-cairo">
            {isEdit ? 'تعديل بيانات المدرس' : 'إضافة مدرس جديد'}
          </h1>
          <p className="text-slate-400 mt-1 font-cairo">
            {isEdit ? 'تعديل بيانات الحساب وتخصيص المنصة والموقع' : 'إنشاء حساب مدرس جديد وتعيين باقة الاشتراك وتوليد النطاق تلقائياً'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Account Info */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
            <User className="text-amber-500" size={20} />
            <span>بيانات الحساب الأساسية</span>
          </h3>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="teacherUsername">
                {isEdit ? 'اسم المستخدم (للدخول)' : 'اسم المستخدم / اسم النطاق الفرعي *'}
              </label>
              <input
                id="teacherUsername"
                type="text"
                required
                disabled={isEdit}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="mr-ahmed"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none disabled:opacity-50 font-mono text-sm"
              />
              {!isEdit && (
                <p className="mt-1 text-xs text-slate-500 font-cairo">
                  سيتم توليد النطاق الفرعي تلقائياً: <span className="font-mono text-amber-500">{previewSlug}.wathba.site</span>
                </p>
              )}
              {isEdit && slug && (
                <p className="mt-1 text-xs text-slate-500 font-cairo">
                  النطاق الفرعي الفعلي للمنصة:{' '}
                  <span className="font-mono text-amber-400">{slug}.wathba.site</span>
                </p>
              )}
            </div>

            {!isEdit && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="teacherPassword">
                  كلمة المرور * (8 أحرف على الأقل)
                </label>
                <input
                  id="teacherPassword"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
                {/* BUG-6 FIX: force_password_change option */}
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

          <div>
            <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="bio">
              الوصف / السيرة الذاتية (Bio)
            </label>
            <textarea
              id="bio"
              rows="3"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="اكتب هنا نبذة عن المدرس لعرضها في الموقع التعريفي..."
              className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none resize-none text-sm"
            ></textarea>
          </div>
        </div>

        {/* Section 2: Plan Selection (Only on Create) — multi-select by category */}
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
                {/* Group plans by category */}
                {[
                  { key: 'platform',      label: 'باقات استضافة المنصة',   color: 'text-amber-400',   border: 'border-amber-500/30' },
                  { key: 'service',       label: 'خدمات الإنتاج والتصميم', color: 'text-sky-400',     border: 'border-sky-500/30'   },
                  { key: 'social_media',  label: 'إدارة السوشيال ميديا',   color: 'text-purple-400',  border: 'border-purple-500/30'},
                ]
                  .filter(({ key }) => plans.some((p) => p.category === key))
                  .map(({ key, label, color, border }) => (
                    <div key={key} className={`rounded-xl border ${border} bg-slate-950/40 p-4 space-y-3`}>
                      <h4 className={`text-xs font-bold font-cairo uppercase tracking-wide ${color}`}>{label}</h4>
                      <div className="space-y-2">
                        {plans
                          .filter((p) => p.category === key)
                          .map((p) => {
                            const checked = selectedPlanIds.has(String(p.id));
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition ${
                                  checked
                                    ? 'border-amber-500/50 bg-amber-500/10'
                                    : 'border-slate-800 hover:border-slate-600'
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

        {/* Section 3: Customization (Branding) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} />
            <span>التخصيص الاحترافي (Branding)</span>
          </h3>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ImageCropper
              aspect={1}
              onComplete={(url) => setLogoUrl(url)}
              label="شعار المدرس / لوجو المنصة (نسبة 1:1)"
              currentImage={logoUrl}
              circular={false}
            />

            <ImageCropper
              aspect={16 / 9}
              onComplete={(url) => setHeroImageUrl(url)}
              label="خلفية المنصة / غلاف الموقع التعريفي (نسبة 16:9)"
              currentImage={heroImageUrl}
            />

            <div>
              <label className="block text-sm font-semibold text-slate-300 font-cairo" htmlFor="bgColor">
                لون خلفية المنصة (اللون الاحتياطي)
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  id="bgColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-10 w-12 rounded border border-slate-800 bg-slate-950 cursor-pointer"
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#0B0F19"
                  className="block w-full max-w-[120px] rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-4 text-white focus:border-amber-500 focus:outline-none text-center font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Support Team Members (Only on Edit) */}
        {isEdit && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
            <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3 flex items-center gap-2">
              <Sparkles className="text-amber-500" size={20} />
              <span>فريق الدعم والمسؤولين (يعرض في الموقع التعريفي)</span>
            </h3>

            {/* Existing team members */}
            <div className="space-y-3">
              {team.length === 0 ? (
                <p className="text-sm text-slate-500 font-cairo">لم يتم إضافة أي أعضاء لفريق الدعم بعد.</p>
              ) : (
                team.map((member) => (
                  <div key={member.id} className="flex items-center justify-between border border-slate-800 bg-slate-950/40 p-3 rounded-xl">
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
                        onClick={() => handleDeleteTeamMember(member.id)}
                        className="rounded-lg bg-red-950/40 p-2 text-red-400 hover:bg-red-900/60 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Team Member form */}
            <div className="border-t border-slate-800 pt-6 space-y-4">
              <h4 className="text-sm font-semibold text-white font-cairo">إضافة عضو جديد للفريق:</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <input
                    type="text"
                    placeholder="الاسم"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-cairo"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="المسمى الوظيفي (دعم فني)"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-cairo"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="هاتف الواتس الخاص به"
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-mono"
                  />
                </div>
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
        )}

        {/* Section: Reset Password (Edit only) */}
        {isEdit && (
          <ResetPasswordSection teacherId={id} />
        )}

        {/* Submit Actions */}
        <div className="flex justify-end gap-4">
          <Link
            to="/teachers"
            className="rounded-xl bg-slate-900 border border-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition font-cairo"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition disabled:opacity-50 font-cairo"
          >
            <Save size={16} />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ البيانات'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Reset Password Section (edit mode only) ─────────────────────── */
function ResetPasswordSection({ teacherId }) {
  const [newPassword, setNewPassword] = useState('');
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
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-3 px-4 text-white placeholder-slate-600 focus:border-red-500 focus:outline-none"
          />
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
