import React, { useEffect, useRef, useState } from 'react';
import {
  GraduationCap, BookOpen, BarChart3, Users, CheckCircle,
  Sparkles, Trophy, MessageCircle, Target, CreditCard,
  Video, Gamepad2, Shield, Star, Zap, Mail,
  ChevronDown, ArrowLeft, Play, FileText, Bell, Award
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';

/* ── Hooks ── */
function useReveal(threshold = 0.1) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function useCounter(target, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let t0 = null;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration, start]);
  return count;
}

/* ── Primitives ── */
function Reveal({ children, className = '', delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ease ${delay}s, transform 0.65s ease ${delay}s`,
    }}>
      {children}
    </div>
  );
}

function StatCard({ value, suffix = '', label, duration = 2000 }) {
  const [ref, visible] = useReveal();
  const count = useCounter(value, duration, visible);
  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-black text-orange-400 mb-1">
        {count.toLocaleString('ar-EG')}{suffix}
      </div>
      <div className="text-white/50 text-sm font-medium">{label}</div>
    </div>
  );
}

/* ── Feature Card ── */
function FeatureCard({ icon: Icon, title, desc, color, delay }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
      transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
    }}
      className="group relative bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-orange-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 cursor-default"
    >
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-white font-bold text-base mb-2">{title}</h3>
      <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

/* ── Pricing Card ── */
function PricingCard({ title, price, period, features, highlight, badge }) {
  return (
    <div className={`relative rounded-2xl p-7 border transition-all duration-300 hover:-translate-y-1 ${
      highlight
        ? 'bg-gradient-to-b from-orange-500/20 to-orange-500/5 border-orange-500/40'
        : 'bg-white/[0.04] border-white/10'
    }`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full">
          {badge}
        </div>
      )}
      <h3 className="text-white font-bold text-xl mb-1">{title}</h3>
      <div className="flex items-end gap-1 mb-1">
        <span className="text-4xl font-black text-orange-400">{price}</span>
        <span className="text-white/40 text-sm mb-1.5">{period}</span>
      </div>
      <div className="border-t border-white/10 my-4" />
      <ul className="space-y-3 mb-6">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-white/70 text-sm">
            <CheckCircle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <a
        href="https://wa.me/201000000000?text=أريد الاستفسار عن منصة وثبة"
        target="_blank"
        rel="noopener noreferrer"
        className={`w-full block text-center py-2.5 rounded-xl font-bold text-sm transition-all ${
          highlight
            ? 'bg-orange-500 hover:bg-orange-600 text-white'
            : 'bg-white/10 hover:bg-white/15 text-white'
        }`}
      >
        تواصل معنا
      </a>
    </div>
  );
}

/* ── FAQ Item ── */
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-right text-white font-semibold text-sm hover:bg-white/5 transition-colors"
      >
        {q}
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform shrink-0 ms-3 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-white/50 text-sm leading-relaxed border-t border-white/10 pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
/*                  MAIN COMPONENT                         */
/* ════════════════════════════════════════════════════════ */
export default function PlatformHome() {
  const WHATSAPP = 'https://wa.me/201000000000?text=أريد الاستفسار عن منصة وثبة';

  useEffect(() => {
    document.title = 'وثبة — منصة تعليمية متكاملة';
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) favicon.href = '/favicon.png';

    const style = document.createElement('style');
    style.id = 'ph-styles';
    style.textContent = `
      @keyframes ph-float { 0%{transform:translateY(0)} 100%{transform:translateY(-18px)} }
      @keyframes ph-spin-slow { to{transform:rotate(360deg)} }
      @keyframes ph-pulse-ring {
        0%{transform:scale(1);opacity:0.4}
        100%{transform:scale(1.6);opacity:0}
      }
      .ph-orb {
        position:absolute;border-radius:50%;filter:blur(100px);
        opacity:0.15;pointer-events:none;
      }
      .ph-float { animation: ph-float 6s ease-in-out infinite alternate; }
      .ph-gradient-text {
        background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .ph-card-glow:hover {
        box-shadow: 0 0 40px rgba(249,115,22,0.12);
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById('ph-styles')?.remove();
  }, []);

  const features = [
    { icon: BookOpen,    title: 'كورسات تفاعلية',     desc: 'رفع فيديوهات وملفات PDF منظّمة في أقسام مع تتبع تقدم كل طالب تلقائياً.',       color: 'bg-orange-500',   delay: 0 },
    { icon: FileText,    title: 'امتحانات ذكية',       desc: 'بنك أسئلة متنوع — اختيار متعدد، صح/غلط، مقالي — مع تصحيح فوري وتحليل تفصيلي.', color: 'bg-violet-600',   delay: 0.05 },
    { icon: BarChart3,   title: 'تحليلات متقدمة',     desc: 'لوحة بيانات شاملة لأداء كل طالب والكورسات والامتحانات بالرسوم البيانية.',         color: 'bg-blue-600',     delay: 0.10 },
    { icon: Users,       title: 'إدارة المساعدين',    desc: 'أضف مساعدين بصلاحيات مخصصة لكل وظيفة — طلاب، مدفوعات، امتحانات وأكثر.',         color: 'bg-emerald-600',  delay: 0.15 },
    { icon: CreditCard,  title: 'إدارة المدفوعات',    desc: 'تتبع طلبات التسجيل وإيصالات الدفع والتحقق منها في لحظات.',                        color: 'bg-pink-600',     delay: 0.20 },
    { icon: Video,       title: 'بث مباشر',           desc: 'حصص مباشرة تفاعلية مدمجة مع Jitsi Meet — شات وكاميرا وإدارة الطلاب.',            color: 'bg-cyan-600',     delay: 0.25 },
    { icon: Trophy,      title: 'نظام نقاط ومتصدرين', desc: 'شارات وترتيب تنافسي يحفّز الطلاب على الاستمرار والتفوق.',                         color: 'bg-yellow-600',   delay: 0.30 },
    { icon: Bell,        title: 'إشعارات فورية',      desc: 'أرسل إشعارات للطلاب وأولياء الأمور عبر الموقع مباشرة.',                           color: 'bg-red-600',      delay: 0.35 },
    { icon: Gamepad2,    title: 'فعاليات وألعاب',     desc: 'لعبة أسبوعية تعليمية Stickman Run مع أسئلة مرتبطة بالمراحل الدراسية.',            color: 'bg-indigo-600',   delay: 0.40 },
    { icon: Target,      title: 'بوابة أولياء الأمور', desc: 'ولي الأمر يتابع أداء ابنه بالرقم فقط — نتائج، كورسات، وترتيب.',                  color: 'bg-teal-600',     delay: 0.45 },
    { icon: Shield,      title: 'أمان وعزل كامل',     desc: 'كل مدرس له بياناته المعزولة — الطلاب والكورسات والنتائج لا تتقاطع أبداً.',          color: 'bg-slate-600',    delay: 0.50 },
    { icon: GraduationCap, title: 'تخصيص كامل',       desc: 'اسم المنصة ولوجو ورابط فريد لكل مدرس — منصتك بهويتك الخاصة.',                    color: 'bg-fuchsia-600',  delay: 0.55 },
  ];

  const faqs = [
    { q: 'إيه الفرق بين وثبة والمنصات التانية؟', a: 'وثبة بتديك منصتك الخاصة بالكامل — اسمك، لوجوك، ورابطك الفريد. مش اكونت على منصة مشتركة، ده موقع خاص بيك أنت بس.' },
    { q: 'هل في تطبيق موبايل؟', a: 'المنصة تشتغل على كل الأجهزة من المتصفح مباشرة. بتدعم الـ PWA يعني تنزلها على شاشة الهاتف زي أي تطبيق.' },
    { q: 'إيه نظام الحماية ضد سرقة الكورسات؟', a: 'المنصة مجهّزة بنظام حماية متكامل — بيمنع التصوير والتسجيل، بيعطّل كليك يمين وكل الاختصارات اللي بتفتح أدوات المطور أو بتحاول تنزّل المحتوى. أي محاولة اختراق بتتسجّل وبتظهر تحذير للطالب فوراً.' },
    { q: 'المنصة بتدعم البث المباشر؟', a: 'أيوه، المنصة بتدعم حصص اللايف أونلاين من جوّاها مباشرةً بدون ما الطالب يخرج من المنصة. الطالب بيلاقي زرار الانضمام للحصة المباشرة على طول من لوحة التحكم بتاعته، ومع الدردشة والإشعارات الفورية.' },
    { q: 'أقدر أضيف مساعدين؟', a: 'أيوه، تقدر تضيف عدد غير محدود من المساعدين وتحدد صلاحيات كل واحد منهم بالتفصيل.' },
    { q: 'في تدريب على استخدام المنصة؟', a: 'أيوه، بنوفر جلسة تدريبية كاملة + دعم فني مستمر لضمان أحسن تجربة ليك ولطلابك.' },
  ];

  return (
    <div dir="rtl" style={{ fontFamily: "'Cairo', sans-serif", background: '#07080F', minHeight: '100vh', color: '#fff', overflowX: 'hidden' }}>

      {/* ── Navbar ── */}
      <nav style={{ position: 'fixed', top: 0, insetInline: 0, zIndex: 100, background: 'rgba(7,8,15,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <img src={wathbaLogo} alt="وثبة" className="h-9 object-contain" />
          <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
            <a href="#features"  className="hover:text-white transition-colors">المميزات</a>
            <a href="#pricing"   className="hover:text-white transition-colors">الأسعار</a>
            <a href="#about"     className="hover:text-white transition-colors">عن المطور</a>
            <a href="#faq"       className="hover:text-white transition-colors">الأسئلة الشائعة</a>
          </div>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
            <MessageCircle className="w-4 h-4" />
            تواصل معنا
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: 'relative', paddingTop: '130px', paddingBottom: '100px', overflow: 'hidden' }}>
        <div className="ph-orb" style={{ width: 600, height: 600, top: -150, right: -100, background: 'radial-gradient(circle, #f97316, transparent 70%)' }} />
        <div className="ph-orb" style={{ width: 500, height: 500, bottom: -100, left: -80, background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }} />

        <div className="max-w-4xl mx-auto px-5 text-center relative z-10">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-bold px-4 py-1.5 rounded-full mb-6 tracking-widest uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              منصة SaaS تعليمية متكاملة
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
              منصتك التعليمية
              <br />
              <span className="ph-gradient-text">بهويتك الخاصة</span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="text-white/50 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
              احصل على منصتك التعليمية الخاصة برابط فريد ولوجو خاص بيك —
              إدارة كورسات، امتحانات، طلاب، ومدفوعات في مكان واحد.
              مصممة خصيصاً لمدرسي السناتر في مصر.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-3.5 rounded-2xl text-base transition-all hover:scale-105 hover:shadow-lg hover:shadow-orange-500/25">
                <MessageCircle className="w-5 h-5" />
                احجز منصتك الآن
              </a>
              <a href="#features"
                className="flex items-center gap-2 bg-white/8 hover:bg-white/12 text-white font-semibold px-7 py-3.5 rounded-2xl text-base border border-white/10 transition-all">
                اعرف أكثر
                <ArrowLeft className="w-4 h-4" />
              </a>
            </div>
          </Reveal>

          {/* Stats bar */}
          <Reveal delay={0.5}>
            <div className="mt-16 pt-10 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatCard value={500}  suffix="+"  label="طالب على المنصة"    />
              <StatCard value={12}   suffix="+"  label="مدرس يستخدم المنصة" />
              <StatCard value={98}   suffix="٪"  label="رضا العملاء"        />
              <StatCard value={24}   suffix="/7" label="دعم فني مستمر"       />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-20">
        <Reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            <Star className="w-3.5 h-3.5" />
            المميزات
          </div>
          <h2 className="text-4xl font-black text-white mb-3">كل اللي محتاجه في مكان واحد</h2>
          <p className="text-white/40 max-w-lg mx-auto">منصة شاملة بتغطي كل جوانب العملية التعليمية من أول التسجيل لحد تتبع الأداء.</p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => <FeatureCard key={i} {...f} />)}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <Reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/25 text-violet-400 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            <Zap className="w-3.5 h-3.5" />
            كيف يشتغل؟
          </div>
          <h2 className="text-4xl font-black text-white mb-3">٣ خطوات وانت شغّال</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { num: '١', title: 'تواصل معنا', desc: 'كلمنا على واتساب وهنساعدك تحدد الباقة المناسبة لحجم عملك.' },
            { num: '٢', title: 'إعداد منصتك', desc: 'هنجهّز منصتك بالاسم واللوجو والرابط الخاص بيك خلال 24 ساعة.' },
            { num: '٣', title: 'ابدأ التدريس', desc: 'ارفع كورساتك وأضف طلابك وابدأ تحصل على نتائج فعلية.' },
          ].map((step, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <div className="relative bg-white/[0.04] border border-white/10 rounded-2xl p-6 text-center ph-card-glow">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-2xl font-black text-white mx-auto mb-4">
                  {step.num}
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="max-w-5xl mx-auto px-5 py-16">
        <Reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            <CreditCard className="w-3.5 h-3.5" />
            الأسعار
          </div>
          <h2 className="text-4xl font-black text-white mb-3">اختار الباقة المناسبة</h2>
          <p className="text-white/40">تواصل معنا للحصول على السعر الدقيق حسب احتياجاتك.</p>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          <PricingCard
            title="ستارتر"
            price="تواصل"
            period="/ شهرياً"
            features={[
              'حتى ٢٠٠ طالب',
              'كورسات غير محدودة',
              'امتحانات وتحليلات',
              'مساعد واحد',
              'دومين فرعي مجاني',
            ]}
          />
          <PricingCard
            title="برو"
            price="تواصل"
            period="/ شهرياً"
            highlight
            badge="الأكثر طلباً"
            features={[
              'طلاب غير محدودين',
              'كل مميزات ستارتر',
              'بث مباشر مدمج',
              'مساعدين غير محدودين',
              'دومين خاص بيك',
              'دعم فني أولوية',
            ]}
          />
          <PricingCard
            title="إنتربرايز"
            price="تواصل"
            period="/ مخصص"
            features={[
              'كل مميزات برو',
              'سيرفر مستقل خاص',
              'تخصيص كامل للواجهة',
              'تكامل مع الواتساب',
              'تقارير PDF مخصصة',
              'SLA مضمون',
            ]}
          />
        </div>
      </section>

      {/* ── About Developer ── */}
      <section id="about" className="max-w-4xl mx-auto px-5 py-16">
        <div className="bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 rounded-3xl p-8 md:p-12">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/25 text-violet-400 text-xs font-bold px-4 py-1.5 rounded-full mb-6 tracking-widest uppercase">
              <GraduationCap className="w-3.5 h-3.5" />
              عن المطور
            </div>
          </Reveal>
          <div className="flex flex-col md:flex-row items-start gap-8">
            <Reveal className="flex-shrink-0">
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-orange-500 to-violet-600 flex items-center justify-center text-4xl font-black text-white select-none">
                م
              </div>
            </Reveal>
            <Reveal delay={0.1} className="flex-1">
              <h3 className="text-white text-2xl font-black mb-1">محمد — مطور منصة وثبة</h3>
              <p className="text-orange-400 font-semibold text-sm mb-4">Full-Stack Developer · مصر</p>
              <p className="text-white/55 leading-relaxed mb-6">
                مطور ويب متخصص في بناء منصات تعليمية متكاملة لمدرسي السناتر في مصر.
                بنيت منصة وثبة من الصفر بكل التفاصيل اللي المدرس محتاجها — من إدارة الطلاب
                وحتى الألعاب التعليمية. هدفي إن كل مدرس يلاقي منصة باسمه ولوجوه
                بسعر معقول ودعم مستمر.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                  <MessageCircle className="w-4 h-4" />
                  واتساب: 01000000000
                </a>
                <a href="mailto:dev@wathba.com"
                  className="flex items-center gap-2 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                  <Mail className="w-4 h-4" />
                  dev@wathba.com
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-16">
        <Reveal className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            الأسئلة الشائعة
          </div>
          <h2 className="text-4xl font-black text-white">عندك سؤال؟</h2>
        </Reveal>
        <div className="space-y-3">
          {faqs.map((f, i) => <FAQItem key={i} {...f} />)}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="max-w-4xl mx-auto px-5 py-10 mb-10">
        <Reveal>
          <div className="relative overflow-hidden bg-gradient-to-r from-orange-500/20 via-orange-500/10 to-violet-600/15 border border-orange-500/25 rounded-3xl p-10 text-center">
            <div className="ph-orb" style={{ width: 300, height: 300, top: -100, right: -50, background: 'radial-gradient(circle, #f97316, transparent 70%)', opacity: 0.2 }} />
            <div className="ph-orb" style={{ width: 250, height: 250, bottom: -80, left: -30, background: 'radial-gradient(circle, #7c3aed, transparent 70%)', opacity: 0.2 }} />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
                جاهز تبدأ منصتك؟
              </h2>
              <p className="text-white/50 mb-8 text-lg">
                كلمنا دلوقتي وهنجهّزلك كل حاجة خلال 24 ساعة.
              </p>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-2xl text-base transition-all hover:scale-105 hover:shadow-xl hover:shadow-orange-500/25">
                <MessageCircle className="w-5 h-5" />
                ابدأ دلوقتي على واتساب
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={wathbaLogo} alt="وثبة" className="h-8 object-contain" />
            <span className="text-white/30 text-sm">منصة تعليمية متكاملة</span>
          </div>
          <p className="text-white/25 text-sm">
            © {new Date().getFullYear()} وثبة — جميع الحقوق محفوظة
          </p>
          <div className="flex items-center gap-4 text-white/40 text-sm">
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">واتساب</a>
            <a href="mailto:dev@wathba.com" className="hover:text-white transition-colors">البريد الإلكتروني</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
