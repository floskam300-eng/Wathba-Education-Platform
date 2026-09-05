import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Eye, GraduationCap, Sparkles, BookOpen, FileText, CheckCircle2,
  Layers, ArrowRight, RefreshCw, X, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function StudentSimulatorModal({ isOpen, onClose, defaultStage = null, defaultDestination = '/student' }) {
  const { startSimulation } = useAuth();
  const { dark } = useTheme();

  const [stage, setStage] = useState(defaultStage || '');
  const [autoEnroll, setAutoEnroll] = useState(true);
  const [resetData, setResetData] = useState(false);
  const [destination, setDestination] = useState(defaultDestination);
  const [loading, setLoading] = useState(false);

  // Fetch teacher's stages
  const { data: stagesData } = useQuery({
    queryKey: ['simulation-stages'],
    queryFn: () => api.get('/teachers/simulation/stages').then(r => r.data),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const allStages = stagesData?.allStages || [
    'الصف الأول الثانوي عام',
    'الصف الأول الثانوي بكالوريا',
    'الصف الثاني الثانوي عام',
    'الصف الثاني الثانوي بكالوريا',
    'الصف الثالث الثانوي',
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
  ];

  const teacherStages = stagesData?.teacherStages || [];

  useEffect(() => {
    if (defaultStage) {
      setStage(defaultStage);
    } else if (stagesData?.defaultStage && !stage) {
      setStage(stagesData.defaultStage);
    } else if (allStages.length > 0 && !stage) {
      setStage(allStages[0]);
    }
  }, [defaultStage, stagesData, allStages, stage]);

  useEffect(() => {
    if (defaultDestination) {
      setDestination(defaultDestination);
    }
  }, [defaultDestination]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stage) {
      toast.error('يرجى اختيار المرحلة الدراسية للمعاينة');
      return;
    }

    setLoading(true);
    try {
      await startSimulation({
        academic_stage: stage,
        auto_enroll: autoEnroll,
        reset_data: resetData,
        destination,
      });
      toast.success(`تم بدء المعاينة كطالب (${stage})`, { icon: '👁️' });
      onClose();
    } catch (err) {
      console.error('[StudentSimulatorModal]', err);
      toast.error('حدث خطأ أثناء بدء وضع المعاينة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div
        className={`max-w-lg w-full rounded-3xl p-6 shadow-2xl border transition-all ${
          dark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-100 text-navy-800'
        }`}
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight">معاينة المنصة كطالب</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                شاهد وتفاعل مع الكورسات والاختبارات كما تظهر لطلابك تماماً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleStartSimulation} className="space-y-4">
          {/* Stage selection */}
          <div>
            <label className="block text-xs font-black text-gray-700 dark:text-gray-300 mb-1.5">
              اختر المرحلة الدراسية للمعاينة:
            </label>
            <div className="relative">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={`w-full py-3 px-4 rounded-2xl border font-bold text-sm outline-none transition-all ${
                  dark
                    ? 'bg-slate-800 border-slate-700 text-white focus:border-orange-500'
                    : 'bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-orange-500'
                }`}
              >
                {teacherStages.length > 0 && (
                  <optgroup label="مراحلك الدراسية النشطة">
                    {teacherStages.map((st) => (
                      <option key={st} value={st}>
                        ★ {st}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="كافة المراحل الدراسية">
                  {allStages
                    .filter((st) => !teacherStages.includes(st))
                    .map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="block text-xs font-black text-gray-700 dark:text-gray-300 mb-2">
              نقطة البداية للمعاينة:
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              {[
                { id: '/student', label: 'لوحة التحكم الرئيسية', icon: Sparkles },
                { id: '/student/courses', label: 'صفحة الكورسات', icon: BookOpen },
                { id: '/student/exams', label: 'صفحة الاختبارات', icon: FileText },
                { id: '/student/recitations', label: 'صفحة التسميع', icon: GraduationCap },
              ].map((dest) => {
                const Icon = dest.icon;
                const active = destination === dest.id;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => setDestination(dest.id)}
                    className={`p-3 rounded-2xl border text-right flex items-center gap-2 transition-all ${
                      active
                        ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-sm font-black'
                        : dark
                        ? 'border-slate-800 bg-slate-800/60 text-gray-400 hover:border-slate-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{dest.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
            <label className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
              <input
                type="checkbox"
                checked={autoEnroll}
                onChange={(e) => setAutoEnroll(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
              />
              <div className="text-right">
                <p className="text-xs font-black text-gray-800 dark:text-gray-200">
                  التحاق تلقائي بجميع كورسات المرحلة
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  يتيح لك استعراض الفيديوهات والملفات والتسميع فوراً كطالب ملتحق
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
              <input
                type="checkbox"
                checked={resetData}
                onChange={(e) => setResetData(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
              />
              <div className="text-right">
                <p className="text-xs font-black text-gray-800 dark:text-gray-200">
                  بدء بتجربة جديدة وتصفير المحاولات السابقة
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  يمسح درجات الاختبارات التجريبية السابقة ونسب المشاهدة
                </p>
              </div>
            </label>
          </div>

          {/* Security & Sandbox notice */}
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 text-[11px] text-orange-700 dark:text-orange-300">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
            <span>بيانات المعاينة معزولة تماماً ولا تؤثر على إحصائياتك أو قوائم طلابك الحقيقية.</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-navy-900 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-navy-900/30 border-t-navy-900 rounded-full animate-spin" />
              ) : (
                <>
                  <Eye className="w-4 h-4 text-navy-900" />
                  <span>بدء المعاينة الآن 🚀</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`py-2 px-4 rounded-xl font-bold text-sm transition-colors ${
                dark ? 'bg-slate-800 text-gray-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
