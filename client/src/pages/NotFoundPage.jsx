import { useNavigate } from 'react-router-dom';
import { Home, ArrowRight } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center" dir="rtl">
      <div className="bg-white rounded-3xl shadow-lg p-8 sm:p-12 max-w-sm w-full space-y-6">
        <div className="text-8xl font-black text-gray-200 leading-none">404</div>
        <div>
          <h1 className="text-xl font-black text-navy-700 mb-2">الصفحة غير موجودة</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-gray-200 hover:border-gray-400 text-gray-600 font-bold text-sm transition-all"
          >
            <ArrowRight className="w-4 h-4" />
            الرجوع للخلف
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all"
          >
            <Home className="w-4 h-4" />
            الصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}
