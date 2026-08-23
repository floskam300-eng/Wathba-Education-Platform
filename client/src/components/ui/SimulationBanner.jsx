import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Eye, RefreshCw, LogOut, GraduationCap, ChevronDown, Check,
  Sparkles, Layers, BookOpen, FileText, LayoutDashboard, Trophy, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function SimulationBanner() {
  const { user, switchSimulatedStage, resetSimulationProgress, exitSimulation } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const [switching, setSwitching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Fetch available stages for the teacher
  const { data: stagesData } = useQuery({
    queryKey: ['simulation-stages'],
    queryFn: () => api.get('/teachers/simulation/stages').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const currentStage = user?.academic_stage || 'الصف الأول الثانوي عام';
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

  const handleStageSelect = async (stage) => {
    if (stage === currentStage) {
      setDropdownOpen(false);
      return;
    }
    setSwitching(true);
    setDropdownOpen(false);
    try {
      await switchSimulatedStage(stage, true);
      qc.invalidateQueries();
      toast.success(`تم التبديل إلى: ${stage}`, { icon: '🎓' });
    } catch (err) {
      toast.error('حدث خطأ أثناء تغيير المرحلة');
    } finally {
      setSwitching(false);
    }
  };

  const handleResetProgress = async () => {
    setResetting(true);
    try {
      await resetSimulationProgress();
      qc.invalidateQueries();
      setConfirmResetOpen(false);
      toast.success('تم تصفير جميع محاولات الاختبارات والفيديوهات التجريبية بنجاح! 🔄');
    } catch (err) {
      toast.error('حدث خطأ أثناء إعادة الضبط');
    } finally {
      setResetting(false);
    }
  };

  const handleExit = async () => {
    try {
      await exitSimulation();
      toast.success('تم الخروج من وضع المعاينة والعودة للوحة المعلم 👍');
    } catch (err) {
      toast.error('حدث خطأ أثناء إنهاء المعاينة');
    }
  };

  return (
    <>
      <aside
        aria-label="شريط وضع محاكاة الطالب"
        className="w-full sticky top-0 z-50 shadow-md backdrop-blur-md transition-all select-none border-b"
        style={{
          background: dark
            ? 'linear-gradient(90deg, #2a1b4e 0%, #1e1b4b 50%, #31133f 100%)'
            : 'linear-gradient(90deg, #4f46e5 0%, #6366f1 40%, #7c3aed 100%)',
          borderColor: dark ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.2)',
          color: '#ffffff',
          direction: 'rtl',
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-4">

          {/* Left badge & mode info */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-black shadow-inner border border-white/25">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
              <Eye className="w-3.5 h-3.5" />
              <span>وضع المعاينة كطالب</span>
            </div>

            {/* Quick stage indicator / Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                disabled={switching}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/25 hover:bg-black/35 active:scale-95 text-white text-xs sm:text-sm font-bold transition-all border border-white/15"
                title="اضغط لتبديل المرحلة الدراسية"
              >
                <GraduationCap className="w-4 h-4 text-amber-300 flex-shrink-0" />
                <span className="truncate max-w-[150px] sm:max-w-[220px]">
                  {switching ? 'جاري التبديل...' : currentStage}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-white/70 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Stage Dropdown Menu */}
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div className={`absolute top-full right-0 mt-1.5 w-64 max-h-72 overflow-y-auto rounded-2xl p-1.5 shadow-2xl z-50 border ${
                    dark ? 'bg-slate-900 border-purple-900/50 text-white' : 'bg-white border-gray-200 text-gray-800'
                  }`}>
                    <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1">
                      <p className="text-[11px] font-black text-gray-400 dark:text-gray-400">اختر المرحلة لمعاينتها:</p>
                    </div>
                    {allStages.map((stage) => {
                      const isSelected = stage === currentStage;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => handleStageSelect(stage)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-sm font-black'
                              : dark
                              ? 'hover:bg-slate-800 text-gray-200'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          <span className="truncate">{stage}</span>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick student navigation shortcuts (hidden on small screens) */}
          <div className="hidden md:flex items-center gap-1.5 bg-black/20 px-2 py-0.5 rounded-xl border border-white/10 text-xs font-bold">
            <button
              type="button"
              onClick={() => navigate('/student')}
              className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                location.pathname === '/student' ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> لوحتي
            </button>
            <button
              type="button"
              onClick={() => navigate('/student/courses')}
              className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                location.pathname.startsWith('/student/courses') ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> الكورسات
            </button>
            <button
              type="button"
              onClick={() => navigate('/student/exams')}
              className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                location.pathname.startsWith('/student/exams') ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> الاختبارات
            </button>
            <button
              type="button"
              onClick={() => navigate('/student/leaderboard')}
              className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                location.pathname.startsWith('/student/leaderboard') ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" /> المتصدرون
            </button>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0 mr-auto sm:mr-0">
            {/* Reset progress button */}
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-bold transition-all border border-white/15"
              title="تصفير محاولات الاختبارات والفيديوهات التي جربتها"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${resetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">إعادة ضبط التجربة</span>
            </button>

            {/* Exit simulation button */}
            <button
              type="button"
              onClick={handleExit}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs sm:text-sm font-black transition-all shadow-md hover:shadow-lg border border-red-400/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>إنهاء المعاينة</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Confirm Reset Progress Modal */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
          <div className={`max-w-md w-full rounded-2xl p-5 shadow-2xl border ${
            dark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-100 text-gray-900'
          }`}>
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-center font-black text-base mb-2">إعادة ضبط بيانات المعاينة؟</h3>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
              سيتم تصفير جميع محاولات الاختبارات والتسميع ومواقيت مشاهدة الفيديوهات لحساب المعاينة الحالي، لتتمكن من تجربة أداء الاختبارات كطالب جديد من البداية.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleResetProgress}
                disabled={resetting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                {resetting ? 'جاري الضبط...' : 'تأكيد إعادة الضبط'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                disabled={resetting}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs transition-colors ${
                  dark ? 'bg-slate-800 text-gray-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
