import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight, Mail, MessageCircle, BookOpen, CreditCard, Shield, AlertTriangle, Users, Video, Trophy, Settings, XCircle } from 'lucide-react';
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

const BulletList = ({ items, color = 'orange' }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2.5">
        <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${color === 'red' ? 'bg-red-400' : 'bg-orange-400'}`} />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export default function TermsAndConditions() {
  useEffect(() => {
    document.title = 'الشروط والأحكام — وثبة';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-[#05080f] text-white" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <style>{`
        @keyframes orb-float2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-15px,-20px) scale(1.08); } }
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
        <div style={{ position: 'absolute', width: 500, height: 500, top: -200, left: -100, borderRadius: '50%', background: 'radial-gradient(circle,#7c3aed,transparent 70%)', opacity: 0.1, filter: 'blur(60px)', animation: 'orb-float2 14s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: -150, right: -80, borderRadius: '50%', background: 'radial-gradient(circle,#f97316,transparent 70%)', opacity: 0.1, filter: 'blur(60px)' }} />
        <div className="relative z-10 max-w-4xl mx-auto px-5 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/25 text-purple-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
            <FileText className="w-3.5 h-3.5" />
            الشروط والأحكام
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            قواعد استخدام<br />
            <span style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              منصة وثبة
            </span>
          </h1>
          <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
            باستخدامك لمنصة وثبة، فأنت توافق على الشروط والأحكام التالية. يرجى قراءتها بعناية قبل البدء في الاستخدام.
          </p>
          <p className="text-white/25 text-xs mt-4">آخر تحديث: مايو ٢٠٢٦</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-5 py-12">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 md:p-12">

          {/* Intro */}
          <div className="bg-purple-500/8 border border-purple-500/20 rounded-xl p-5 mb-10">
            <p className="text-white/70 text-sm leading-relaxed">
              <span className="text-purple-400 font-bold">منصة وثبة</span> هي منصة تعليمية مقدمة من مطور مستقل لمدرسي السناتر في مصر، تتيح لكل معلم منصته التعليمية الخاصة برابط فريد. هذه الشروط تُنظّم العلاقة بين المنصة من جهة والمعلمين والطلاب من جهة أخرى. استخدامك للمنصة يعني موافقتك الضمنية على ما يلي.
            </p>
          </div>

          <Section icon={Users} title="أولاً: التسجيل والحسابات">
            <p className="font-semibold text-white/80 mb-2">للمعلمين (أصحاب المنصات):</p>
            <BulletList items={[
              'يتم إنشاء حساب المعلم حصرياً عبر التواصل المباشر مع فريق وثبة',
              'أنت مسؤول مسؤولية كاملة عن جميع الأنشطة التي تتم عبر حسابك',
              'يجب تغيير كلمة المرور الافتراضية فور أول تسجيل دخول',
              'يحق للمعلم إضافة مساعدين بصلاحيات محددة ويتحمل المسؤولية عن تصرفاتهم',
              'يُمنع مشاركة بيانات الدخول مع أطراف أخرى غير مُفوَّضة',
            ]} />
            <p className="font-semibold text-white/80 mb-2 mt-4">للطلاب:</p>
            <BulletList items={[
              'يُنشئ المعلم أو المساعد حساب الطالب نيابةً عنه',
              'يجب على الطالب تقديم بيانات صحيحة ودقيقة',
              'الطالب مسؤول عن الحفاظ على سرية بيانات دخوله',
              'يُمنع مشاركة الحساب مع طلاب آخرين',
            ]} />
          </Section>

          <Section icon={BookOpen} title="ثانياً: استخدام المحتوى التعليمي" accent="purple">
            <p>المحتوى التعليمي المتاح على المنصة (فيديوهات، ملفات PDF، امتحانات) هو ملك للمعلم الذي رفعه. يُسمح للطالب باستخدامه للأغراض التعليمية الشخصية فقط، ويُحظر تماماً:</p>
            <BulletList items={[
              'تنزيل الفيديوهات أو ملفات PDF أو نسخها بأي وسيلة',
              'تصوير الشاشة أو تسجيل المحتوى',
              'إعادة نشر المحتوى أو توزيعه على منصات أخرى أو مجموعات واتساب',
              'استخدام أدوات المطور أو أي أدوات برمجية لاستخراج المحتوى',
              'منح الوصول لأشخاص غير مسجلين في المنصة',
            ]} color="red" />
            <p className="mt-3">المنصة مجهّزة بأنظمة حماية تقنية متقدمة وأي محاولة للتجاوز تُسجَّل وقد تؤدي إلى إيقاف الحساب فوراً.</p>
          </Section>

          <Section icon={CreditCard} title="ثالثاً: المدفوعات والتسجيل في الكورسات">
            <BulletList items={[
              'رسوم التسجيل في الكورسات تُحدَّد من قِبل المعلم صاحب المنصة وقد تختلف من كورس لآخر',
              'يتم التسجيل بعد رفع صورة إيصال الدفع والتحقق منه من قِبل المعلم أو مساعده',
              'طرق الدفع المقبولة: فودافون كاش، إنستاباي، وأي طرق إضافية يحددها المعلم',
              'لا يتم تفعيل الكورس إلا بعد تأكيد المعلم لعملية الدفع',
              'في حالة وجود خطأ في الدفع أو رفض الطلب، يتم التواصل مع المعلم مباشرة لحل الأمر',
              'لا ترتبط منصة وثبة بأي مبالغ مالية تُدفع للمعلمين — العلاقة المالية مباشرة بين الطالب والمعلم',
            ]} />
          </Section>

          <Section icon={Video} title="رابعاً: البث المباشر والحصص الأونلاين" accent="purple">
            <BulletList items={[
              'حصص البث المباشر تُقدَّم عبر Jitsi Meet المدمج في المنصة',
              'يلتزم الطالب بالآداب العامة خلال الحصة المباشرة',
              'يُحق للمعلم إزالة أي طالب مُخِّل من الحصة',
              'يُمنع تسجيل الحصص المباشرة من قِبل الطالب',
              'لا تتحمل منصة وثبة مسؤولية أي انقطاع في الإنترنت من جانب المعلم أو الطالب',
            ]} />
          </Section>

          <Section icon={Trophy} title="خامساً: النقاط والمسابقات والألعاب التعليمية">
            <BulletList items={[
              'يكسب الطالب نقاطاً من خلال أداء الامتحانات، وإتمام الكورسات، والمشاركة في الفعاليات',
              'لوحة المتصدرين تُعاد تلقائياً كل شهر ويمكن للمعلم إعادتها يدوياً أيضاً',
              'لعبة Stickman Run الأسبوعية متاحة مرة واحدة في الأسبوع لكل طالب',
              'النقاط هي نظام تحفيزي داخلي ولا تُمثّل أي قيمة مالية أو مكافأة مادية',
              'يحق للمعلم تعديل نقاط الطلاب يدوياً وفق رؤيته التعليمية',
            ]} />
          </Section>

          <Section icon={Shield} title="سادساً: التزامات المعلم (صاحب المنصة)" accent="purple">
            <BulletList items={[
              'المعلم مسؤول كامل المسؤولية عن المحتوى الذي يرفعه — فيديوهات، PDF، أسئلة امتحانات',
              'يلتزم المعلم بعدم نشر محتوى مُنتَهَك الحقوق أو محتوى مسيء',
              'المعلم مسؤول عن إدارة علاقته المالية مع طلابه بشكل مستقل عن منصة وثبة',
              'يلتزم المعلم بحماية بيانات طلابه وعدم الإفصاح عنها لأطراف ثالثة',
              'يحق للمعلم تفعيل حسابات الطلاب وإيقافها وفق سياسته التعليمية',
              'يلتزم المعلم بدفع رسوم الاشتراك في منصة وثبة في مواعيدها المتفق عليها',
            ]} />
          </Section>

          <Section icon={Settings} title="سابعاً: حدود مسؤولية منصة وثبة">
            <BulletList items={[
              'منصة وثبة هي أداة تقنية فقط وليست مسؤولة عن جودة المحتوى التعليمي المقدَّم',
              'لا نتحمل مسؤولية أي نزاعات مالية أو علاقات مباشرة بين المعلمين وطلابهم',
              'نسعى للحفاظ على توفر المنصة ٢٤ ساعة يومياً لكن لا نضمن خلوها من انقطاعات الصيانة',
              'نحتفظ بحق إيقاف خدمة أي معلم يثبت انتهاكه لهذه الشروط دون استرداد الرسوم',
              'في حالة فشل تقني خارج عن إرادتنا، نعمل على الإصلاح في أقرب وقت ممكن',
            ]} />
          </Section>

          <Section icon={AlertTriangle} title="ثامناً: الأنشطة المحظورة" accent="purple">
            <p>يُحظر تماماً على جميع مستخدمي المنصة ما يلي:</p>
            <BulletList items={[
              'محاولة اختراق المنصة أو قاعدة البيانات أو بيانات مستخدمين آخرين',
              'إنشاء حسابات وهمية أو انتحال شخصية مستخدمين آخرين',
              'نشر أي محتوى غير لائق أو مسيء عبر الشات في البث المباشر',
              'استخدام المنصة لأغراض تجارية غير مرخصة أو إعادة بيع الوصول',
              'التلاعب في نتائج الامتحانات أو نقاط المتصدرين بأي وسيلة غير مشروعة',
              'استخدام برامج تلقائية (Bots) للتفاعل مع المنصة',
            ]} color="red" />
          </Section>

          <Section icon={XCircle} title="تاسعاً: إيقاف الحسابات والإنهاء">
            <BulletList items={[
              'يحق لنا إيقاف أو إغلاق أي حساب يثبت انتهاكه لهذه الشروط وذلك فوراً وبدون إشعار مسبق',
              'انتهاء اشتراك المعلم يؤدي إلى إيقاف مؤقت للمنصة حتى تجديد الاشتراك',
              'يمكن للمعلم طلب حذف بياناته نهائياً عبر التواصل معنا قبل ٣٠ يوماً من الإنهاء',
              'الطالب الذي يتعرض للإيقاف من قِبل المعلم لا يحق له المطالبة باسترداد أي رسوم',
              'عند انتهاء الاشتراك، تُتاح للمعلم فترة ٣٠ يوماً لتصدير بياناته قبل الحذف النهائي',
            ]} />
          </Section>

          {/* Warning Box */}
          <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-5 mb-10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-amber-300 font-bold text-sm mb-2">تنبيه مهم بشأن حماية المحتوى</h4>
                <p className="text-white/55 text-sm leading-relaxed">
                  أي محاولة لتجاوز أنظمة حماية المحتوى أو تسريب الفيديوهات أو ملفات PDF بأي وسيلة كانت يُعدّ انتهاكاً صريحاً لحقوق الملكية الفكرية للمعلم وقد يعرض مرتكبه للمساءلة القانونية. المنصة تسجّل جميع محاولات التجاوز.
                </p>
              </div>
            </div>
          </div>

          <Section icon={FileText} title="عاشراً: التعديلات على الشروط" accent="purple">
            <BulletList items={[
              'نحتفظ بحقنا في تعديل هذه الشروط في أي وقت',
              'سيتم إشعارك بالتغييرات الجوهرية عبر الإشعارات داخل المنصة',
              'استمرارك في استخدام المنصة بعد التعديل يُعدّ قبولاً للشروط المحدثة',
              'الشروط مكتوبة بالعربية وهي المرجع الرسمي في حالة أي نزاع',
              'تخضع هذه الشروط للقانون المصري',
            ]} />
          </Section>

          {/* Contact */}
          <div className="mt-10 bg-gradient-to-br from-purple-500/10 to-orange-500/5 border border-purple-500/20 rounded-2xl p-6">
            <h3 className="text-white font-black text-base mb-3">للتواصل والاستفسار</h3>
            <p className="text-white/55 text-sm mb-4">إذا كان لديك أي سؤال أو استفسار حول هذه الشروط، تواصل معنا مباشرة:</p>
            <div className="flex flex-wrap gap-3">
              <a href="https://wa.me/201000000000?text=استفسار عن الشروط والأحكام"
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                <MessageCircle className="w-4 h-4" />
                واتساب: 01000000000
              </a>
              <a href="mailto:dev@wathba.com"
                className="flex items-center gap-2 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                <Mail className="w-4 h-4" />
                dev@wathba.com
              </a>
            </div>
          </div>

          <p className="text-white/25 text-xs mt-8 text-center leading-relaxed">
            باستخدامك لمنصة وثبة، فأنت تقرّ بأنك قد قرأت هذه الشروط وفهمتها ووافقت عليها.
          </p>
        </div>

        {/* Back link */}
        <div className="text-center mt-8 flex items-center justify-center gap-6">
          <Link to="/" className="text-white/40 hover:text-orange-400 text-sm font-semibold transition-colors flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            العودة للصفحة الرئيسية
          </Link>
          <Link to="/privacy" className="text-white/40 hover:text-orange-400 text-sm font-semibold transition-colors">
            سياسة الخصوصية
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
