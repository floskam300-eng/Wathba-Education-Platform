import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowRight, Mail, MessageCircle, Eye, Database, Lock, Users, Bell, Trash2, RefreshCw, HelpCircle } from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';

const Section = ({ icon: Icon, title, children, accent = 'orange' }) => (
  <div className="mb-10">
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent === 'purple' ? 'bg-purple-500/15 border border-purple-500/25' : 'bg-orange-500/15 border border-orange-500/25'}`}>
        <Icon className={`w-4.5 h-4.5 ${accent === 'purple' ? 'text-purple-400' : 'text-orange-400'}`} style={{ width: 18, height: 18 }} />
      </div>
      <h2 className={`text-lg font-black ${accent === 'purple' ? 'text-purple-300' : 'text-orange-300'}`}>{title}</h2>
    </div>
    <div className="text-white/65 text-sm leading-relaxed space-y-3 pr-12">
      {children}
    </div>
  </div>
);

const BulletList = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'سياسة الخصوصية — وثبة';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-[#05080f] text-white" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <style>{`
        @keyframes orb-float { from { transform: translate(0,0) scale(1); } to { transform: translate(15px,-20px) scale(1.08); } }
      `}</style>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[#05080f]/90 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={wathbaLogo} alt="وثبة" className="h-9 w-auto rounded-xl" />
          </Link>
          <Link to="/"
            className="flex items-center gap-2 text-white/50 hover:text-orange-400 text-sm font-semibold transition-colors">
            <ArrowRight className="w-4 h-4" />
            العودة للرئيسية
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden bg-[#070b15] py-16 mb-2">
        <div style={{ position: 'absolute', width: 500, height: 500, top: -200, right: -100, borderRadius: '50%', background: 'radial-gradient(circle,#f97316,transparent 70%)', opacity: 0.1, filter: 'blur(60px)', animation: 'orb-float 12s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: -150, left: -80, borderRadius: '50%', background: 'radial-gradient(circle,#7c3aed,transparent 70%)', opacity: 0.1, filter: 'blur(60px)' }} />
        <div className="relative z-10 max-w-4xl mx-auto px-5 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
            <Shield className="w-3.5 h-3.5" />
            سياسة الخصوصية
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            نحن نحمي<br />
            <span style={{ background: 'linear-gradient(135deg,#f97316,#fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              بياناتك وخصوصيتك
            </span>
          </h1>
          <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
            هذه الصفحة توضح بشفافية كاملة ما نجمعه من بيانات، وكيف نستخدمها، وكيف نحميها على منصة وثبة التعليمية.
          </p>
          <p className="text-white/25 text-xs mt-4">آخر تحديث: مايو ٢٠٢٦</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-5 py-12">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 md:p-12">

          {/* Intro */}
          <div className="bg-orange-500/8 border border-orange-500/20 rounded-xl p-5 mb-10">
            <p className="text-white/70 text-sm leading-relaxed">
              <span className="text-orange-400 font-bold">منصة وثبة</span> هي منصة تعليمية متكاملة مصممة خصيصاً لمدرسي السناتر في مصر. نحن نلتزم بحماية خصوصية جميع مستخدمي المنصة — المعلمين والمساعدين والطلاب وأولياء الأمور — ولا نتعامل مع بياناتك الشخصية إلا وفق ما هو موضح في هذه السياسة.
            </p>
          </div>

          <Section icon={Database} title="البيانات التي نجمعها">
            <p className="font-semibold text-white/80 mb-2">أولاً: بيانات المعلمين (أصحاب المنصات)</p>
            <BulletList items={[
              'الاسم الكامل واسم المستخدم وكلمة المرور (مشفّرة)',
              'رقم الواتساب للتواصل ودعم الطلاب',
              'التخصص الأكاديمي والسيرة الذاتية المختصرة',
              'اللوجو وصورة الملف الشخصي',
              'إعدادات المنصة الخاصة (اسم المنصة، الرابط الفريد)',
            ]} />
            <p className="font-semibold text-white/80 mb-2 mt-4">ثانياً: بيانات الطلاب</p>
            <BulletList items={[
              'الاسم الكامل واسم المستخدم',
              'رقم الهاتف ورقم هاتف ولي الأمر',
              'المرحلة الدراسية والنوع (ذكر/أنثى)',
              'تقدم مشاهدة الفيديوهات (الوقت الحالي ونسبة المشاهدة)',
              'نتائج الامتحانات والنقاط المكتسبة والشارات',
              'سجل الحضور والمشاركة في الحصص المباشرة',
              'رمز FCM Token لاستقبال الإشعارات الفورية على المتصفح',
            ]} />
            <p className="font-semibold text-white/80 mb-2 mt-4">ثالثاً: بيانات المدفوعات والتسجيل</p>
            <BulletList items={[
              'مبلغ الدفع وطريقة السداد (فودافون كاش / إنستاباي)',
              'رقم المرجع وصورة إيصال الدفع',
              'حالة الطلب (قيد الانتظار / مُحقَّق / مرفوض)',
              'الكورس المراد التسجيل فيه',
            ]} />
            <p className="font-semibold text-white/80 mb-2 mt-4">رابعاً: بيانات الأجهزة (نظام الحماية)</p>
            <BulletList items={[
              'معرّف الجهاز الفريد (Device ID) المولَّد محلياً في متصفحك ومحفوظ في localStorage',
              'نوع الجهاز والمتصفح ونظام التشغيل (من User-Agent)',
              'عنوان IP لكل جلسة تسجيل دخول — لأغراض الأمان وتتبع الأجهزة فقط',
              'تاريخ أول تسجيل دخول وآخر تسجيل دخول لكل جهاز',
            ]} />
            <p className="font-semibold text-white/80 mb-2 mt-4">خامساً: بيانات الاستخدام التلقائية</p>
            <BulletList items={[
              'تواريخ وأوقات تسجيل الدخول',
              'سجل الأنشطة داخل المنصة (الامتحانات، الكورسات، الفيديوهات)',
            ]} />
          </Section>

          <Section icon={Eye} title="كيف نستخدم البيانات" accent="purple">
            <BulletList items={[
              'تشغيل المنصة وتقديم الخدمات التعليمية للمعلمين والطلاب',
              'تتبع تقدم الطالب في الفيديوهات والامتحانات وعرض التحليلات للمعلم',
              'إرسال إشعارات فورية عند نشر كورس جديد أو نتيجة امتحان أو موعد حصة مباشرة',
              'تمكين ولي الأمر من متابعة أداء ابنه عبر بوابة أولياء الأمور باستخدام رقم الهاتف فقط',
              'إدارة طلبات التسجيل والمدفوعات والتحقق منها',
              'حساب النقاط والترتيب في لوحة المتصدرين',
              'تحسين أداء المنصة وإصلاح الأخطاء التقنية',
            ]} />
          </Section>

          <Section icon={Users} title="من يرى بياناتك؟">
            <p>البيانات التي تُدخلها على منصة معلم بعينه تكون مرئية فقط لهذا المعلم ومساعديه المُفوَّضين. ولا تتقاطع بيانات طلاب أي معلم مع معلمين آخرين على الإطلاق.</p>
            <p className="font-semibold text-white/80 mt-3 mb-2">الأطراف التي قد ترى بياناتك:</p>
            <BulletList items={[
              'المعلم صاحب المنصة: يرى جميع بيانات طلابه ونتائجهم ومدفوعاتهم',
              'المساعدون المُفوَّضون: يرون فقط ما سمح لهم المعلم برؤيته (9 مستويات صلاحية)',
              'ولي الأمر: يرى فقط بيانات ابنه/ابنته عبر بوابة أولياء الأمور',
              'فريق تطوير منصة وثبة: للصيانة الفنية الطارئة فقط وبشكل سري تام',
              'لا نبيع بياناتك ولا نشاركها مع أي طرف ثالث لأغراض تجارية أو إعلانية',
            ]} />
          </Section>

          <Section icon={Lock} title="كيف نحمي بياناتك" accent="purple">
            <BulletList items={[
              'تشفير كلمات المرور باستخدام خوارزمية bcrypt ولا يمكن لأحد الاطلاع عليها',
              'جميع الاتصالات مشفرة بـ HTTPS/TLS',
              'ملفات الفيديو والـ PDF محمية وتتطلب JWT Token صالح للوصول إليها',
              'حماية من هجمات التوقف المتكررة (Rate Limiting) لمنع محاولات الاختراق',
              'قاعدة البيانات محمية على خوادم Replit المُدارة مع عزل كامل بين منصات المعلمين',
              'سجل كامل لجميع العمليات الحساسة كالمدفوعات والتعديلات',
            ]} />
          </Section>

          <Section icon={Bell} title="الإشعارات والتواصل">
            <p>قد نرسل إليك إشعارات داخل المنصة في الحالات التالية:</p>
            <BulletList items={[
              'نشر كورس جديد أو امتحان جديد',
              'ظهور نتيجة امتحانك',
              'الموافقة على طلب التسجيل أو رفضه',
              'بدء حصة مباشرة',
              'حصولك على شارة أو مكافأة',
              'إشعارات المعلم عند إرسالها للطلاب',
            ]} />
            <p className="mt-3">يمكنك تعطيل إشعارات المتصفح في أي وقت من إعدادات المتصفح الخاص بك.</p>
          </Section>

          <Section icon={RefreshCw} title="الاحتفاظ بالبيانات وحذفها" accent="purple">
            <BulletList items={[
              'تُحتفظ بياناتك طالما كان حسابك نشطاً على المنصة',
              'بيانات الطالب لا تُحذف تلقائياً لكنها تُخفى (Soft Delete) عند الإزالة من قِبل المعلم، مع إمكانية استعادتها',
              'يمكن للمعلم تصدير بيانات طلابه كاملة بصيغة Excel من صفحة النسخ الاحتياطي',
              'عند انتهاء اشتراك المعلم، يمكن طلب حذف البيانات نهائياً عبر التواصل معنا',
              'سجلات المدفوعات تُحتفظ بها لأغراض المحاسبة والمراجعة المالية',
            ]} />
          </Section>

          <Section icon={HelpCircle} title="ملفات الكوكيز والتخزين المحلي">
            <p>لا نستخدم ملفات Cookies التتبعية. نستخدم فقط:</p>
            <BulletList items={[
              'localStorage لحفظ JWT Token (رمز تسجيل الدخول) محلياً في متصفحك',
              'localStorage لحفظ بعض التفضيلات مثل الوضع الليلي/النهاري',
              'يمكنك مسح هذه البيانات في أي وقت من إعدادات المتصفح وسيتطلب ذلك تسجيل الدخول مرة أخرى',
            ]} />
          </Section>

          <Section icon={Trash2} title="حقوقك كمستخدم" accent="purple">
            <p>كمستخدم لمنصة وثبة، تتمتع بالحقوق التالية:</p>
            <BulletList items={[
              'الحق في الاطلاع على بياناتك الشخصية المحفوظة',
              'الحق في تصحيح أي بيانات غير دقيقة عبر المعلم أو مباشرة',
              'الحق في طلب حذف بياناتك نهائياً عند انتهاء التعامل مع المنصة',
              'الحق في الاعتراض على أي استخدام لبياناتك لا يتوافق مع ما هو مذكور هنا',
            ]} />
          </Section>

          {/* Contact */}
          <div className="mt-10 bg-gradient-to-br from-orange-500/10 to-purple-500/5 border border-orange-500/20 rounded-2xl p-6">
            <h3 className="text-white font-black text-base mb-3">للتواصل والاستفسار</h3>
            <p className="text-white/55 text-sm mb-4">إذا كان لديك أي سؤال حول سياسة الخصوصية أو تريد ممارسة أي من حقوقك، تواصل معنا:</p>
            <div className="flex flex-wrap gap-3">
              <a href="https://wa.me/201000000000?text=استفسار عن سياسة الخصوصية"
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                <MessageCircle className="w-4 h-4" />
                واتساب: 01000000000
              </a>
              <a href="mailto:dev@wathba.com"
                className="flex items-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                <Mail className="w-4 h-4" />
                dev@wathba.com
              </a>
            </div>
          </div>

          {/* Note */}
          <p className="text-white/25 text-xs mt-8 text-center leading-relaxed">
            نحتفظ بحقنا في تعديل هذه السياسة في أي وقت. سيتم إخطارك بأي تغييرات جوهرية عبر الإشعارات داخل المنصة أو عبر البريد الإلكتروني إن توفر. استمرارك في استخدام المنصة بعد التعديل يُعدّ قبولاً للسياسة المحدثة.
          </p>
        </div>

        {/* Back link */}
        <div className="text-center mt-8 flex items-center justify-center gap-6">
          <Link to="/" className="text-white/40 hover:text-orange-400 text-sm font-semibold transition-colors flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            العودة للصفحة الرئيسية
          </Link>
          <Link to="/terms" className="text-white/40 hover:text-orange-400 text-sm font-semibold transition-colors">
            الشروط والأحكام
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.07] py-6 mt-8">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <p className="text-white/20 text-xs">© {new Date().getFullYear()} منصة وثبة — جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
}
