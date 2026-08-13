import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Users, Plus, CheckCircle, AlertCircle, Copy,
  RefreshCw, Pencil, Smartphone, GraduationCap, Check,
  Send, Sparkles, UserPlus, FileSpreadsheet, Layers, ShieldCheck,
  Eye, EyeOff
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { validateStudentForm, hasErrors } from '../../lib/validation';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-500 text-xs font-semibold mt-1">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
    </p>
  );
}

const STAGES = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي عام',
  'الصف الأول الثانوي بكالوريا',
  'الصف الثاني الثانوي عام',
  'الصف الثاني الثانوي بكالوريا',
  'الصف الثالث الثانوي',
];

const STAGE_PREFIX_LABELS = {
  'الصف الأول الابتدائي': 'P1',
  'الصف الثاني الابتدائي': 'P2',
  'الصف الثالث الابتدائي': 'P3',
  'الصف الرابع الابتدائي': 'P4',
  'الصف الخامس الابتدائي': 'P5',
  'الصف السادس الابتدائي': 'P6',
  'الصف الأول الإعدادي': 'A',
  'الصف الثاني الإعدادي': 'B',
  'الصف الثالث الإعدادي': 'C',
  'الصف الأول الثانوي عام': 'HA',
  'الصف الأول الثانوي بكالوريا': 'HB',
  'الصف الثاني الثانوي عام': 'NA',
  'الصف الثاني الثانوي بكالوريا': 'NB',
  'الصف الثالث الثانوي': 'T',
};

const STAGE_COLORS = {
  'الصف الأول الابتدائي': 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50',
  'الصف الثاني الابتدائي': 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800/50',
  'الصف الثالث الابتدائي': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
  'الصف الرابع الابتدائي': 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50',
  'الصف الخامس الابتدائي': 'bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800/50',
  'الصف السادس الابتدائي': 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50',
  'الصف الأول الإعدادي': 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
  'الصف الثاني الإعدادي': 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/50',
  'الصف الثالث الإعدادي': 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/50',
  'الصف الأول الثانوي عام': 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50',
  'الصف الأول الثانوي بكالوريا': 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/50',
  'الصف الثاني الثانوي عام': 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50',
  'الصف الثاني الثانوي بكالوريا': 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/50',
  'الصف الثالث الثانوي': 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50',
};

const emptyForm = {
  name: '',
  phone: '',
  parent_phone: '',
  academic_stage: '',
  gender: '',
  manualUsername: '',
  manualPassword: '',
};

export default function AddStudent() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [credMode, setCredMode] = useState('auto'); // 'auto' | 'manual'
  const [previewUsername, setPreviewUsername] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [stayOnStage, setStayOnStage] = useState(true);

  // Session history for added students
  const [sessionStudents, setSessionStudents] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const nameInputRef = useRef(null);

  // Fetch active stage counts
  const { data: stageCountsData = [] } = useQuery({
    queryKey: ['stage-counts'],
    queryFn: () => api.get('/students/stage-counts').then(r => r.data.counts || []),
  });
  const totalStudentsCount = stageCountsData.reduce((sum, sc) => sum + (sc.count ?? 0), 0);

  // Preview next username when stage changes in auto mode
  useEffect(() => {
    if (credMode !== 'auto' || !form.academic_stage) {
      setPreviewUsername('');
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    api.get('/students/next-username', { params: { stage: form.academic_stage } })
      .then(r => {
        if (!cancelled) setPreviewUsername(r.data.username);
      })
      .catch(() => {
        if (!cancelled) {
          const p = STAGE_PREFIX_LABELS[form.academic_stage] || 'S';
          setPreviewUsername(`${p}???`);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [form.academic_stage, credMode]);

  const clearError = (field) => {
    setFormErrors(prev => {
      const n = { ...prev };
      delete n[field];
      return n;
    });
  };

  const copyToClipboard = (text, id = null) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast.success('تم النسخ للحافظة! 📋');
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    });
  };

  const togglePasswordVisibility = (studentId) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const createMut = useMutation({
    mutationFn: (data) => api.post('/students', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['stage-counts'] });
      qc.invalidateQueries({ queryKey: ['teacher-dashboard'] });

      const newStudent = res.data;
      toast.success(`تمت إضافة الطالب «${newStudent.name}» بنجاح 🎉`);

      // Add to session list (at beginning)
      setSessionStudents(prev => [newStudent, ...prev]);

      // Reset form (keep stage if stayOnStage is checked)
      const currentStage = stayOnStage ? form.academic_stage : '';
      setForm({
        ...emptyForm,
        academic_stage: currentStage,
      });
      setFormErrors({});

      // Refocus name input for rapid entry
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    },
    onError: (e) => {
      toast.error(e.response?.data?.error || 'حدث خطأ أثناء إضافة الطالب');
    },
  });

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const errs = validateStudentForm(form, false, credMode);
    if (hasErrors(errs)) {
      setFormErrors(errs);
      toast.error('يرجى مراجعة وتصحيح الحقول المطلوبة');
      return;
    }
    setFormErrors({});

    const { manualUsername, manualPassword, ...baseForm } = form;
    const payload = credMode === 'manual'
      ? { ...baseForm, credMode: 'manual', manualUsername: manualUsername.trim(), manualPassword }
      : { ...baseForm, credMode: 'auto' };

    createMut.mutate(payload);
  };

  const handleCopyAllSession = () => {
    if (!sessionStudents.length) return;
    const text = sessionStudents.map((s, idx) => {
      const pwd = s.generated_password || s.plain_password || '—';
      return `${idx + 1}. الاسم: ${s.name}\n   كود الدخول: ${s.username}\n   كلمة المرور: ${pwd}\n   المرحلة: ${s.academic_stage || '—'}\n`;
    }).join('\n────────────────────\n');

    copyToClipboard(text);
  };

  const handleWhatsAppShare = (student) => {
    const pwd = student.generated_password || student.plain_password || '—';
    const msg = `مرحباً بك يا ${student.name} في المنصة التعليمية 🎓\n\nبيانات تسجيل الدخول الخاصة بك:\n🔹 كود الطالب (اسم المستخدم): ${student.username}\n🔹 كلمة المرور: ${pwd}\n\nنتمنى لك كل التوفيق والنجاح! 🌟`;
    const targetPhone = student.phone || student.parent_phone;
    let url = `https://wa.me/`;
    if (targetPhone) {
      const cleanPhone = targetPhone.replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('0') ? `2${cleanPhone}` : cleanPhone;
      url += `${fullPhone}?text=${encodeURIComponent(msg)}`;
    } else {
      url += `?text=${encodeURIComponent(msg)}`;
    }
    window.open(url, '_blank');
  };

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100%+2rem)] lg:h-[calc(100%+3rem)] flex flex-col overflow-hidden bg-slate-50/60 dark:bg-transparent" dir="rtl">
      
      {/* ── Fixed Top Header ── */}
      <div className="flex-shrink-0 bg-white dark:bg-[#17151F] border-b border-gray-200 dark:border-amber-500/10 shadow-sm z-10">
        <div className="px-3 sm:px-4 lg:px-6 py-3 flex items-center justify-between gap-2 sm:gap-3">
          
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(`/${baseRole}/students`)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#272439] transition-all font-bold text-xs sm:text-sm flex-shrink-0"
              title="العودة لقائمة الطلاب"
            >
              <ArrowRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="inline">رجوع للطلاب</span>
            </button>

            <div className="h-5 w-px bg-gray-200 dark:bg-amber-500/20 flex-shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <h1 className="font-black text-navy-800 dark:text-gray-100 text-xs sm:text-base truncate flex items-center gap-2">
                  إضافة طالب جديد
                </h1>
                <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 font-medium hidden sm:block">
                  تسجيل بيانات الطالب وتوليد كود تسجيل الدخول وكلمة المرور
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span>إجمالي الطلاب: <strong>{totalStudentsCount}</strong></span>
            </div>

            {sessionStudents.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-300 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold animate-in fade-in duration-200">
                <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                <span className="hidden sm:inline">أُضيف في هذه الجلسة:</span>
                <strong>{sessionStudents.length}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable Workspace Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          
          {/* ════════════ Left Column (RTL Form Workspace): 7 cols ════════════ */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5 order-1">
            
            {/* Main Form Card */}
            <div className="card !p-4 sm:!p-6 bg-white dark:bg-[#17151F] border border-gray-200 dark:border-amber-500/10 rounded-2xl shadow-sm">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-amber-500/10 pb-4 mb-5">
                <div>
                  <h2 className="text-sm sm:text-base font-black text-navy-800 dark:text-gray-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-500" />
                    بيانات الطالب الجديد
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">املأ البيانات المطلوبة بالأسفل</p>
                </div>

                {/* Stay on stage toggle checkbox */}
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer select-none bg-gray-50 dark:bg-[#1F1C2C] hover:bg-gray-100 dark:hover:bg-[#272439] border border-gray-200 dark:border-amber-500/10 px-3 py-1.5 rounded-xl transition-colors">
                  <input
                    type="checkbox"
                    checked={stayOnStage}
                    onChange={e => setStayOnStage(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-orange-600 accent-orange-500 cursor-pointer"
                  />
                  <span>تثبيت المرحلة لإضافة طلاب متتاليين</span>
                </label>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                
                {/* ── Mode Switcher Tabs ── */}
                <div>
                  <label className="block text-xs font-black text-navy-800 dark:text-gray-200 mb-2">طريقة إنشاء كود وبيانات الدخول</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-[#1F1C2C] rounded-xl border border-gray-200 dark:border-amber-500/10">
                    <button
                      type="button"
                      onClick={() => {
                        setCredMode('auto');
                        setFormErrors(prev => {
                          const n = { ...prev };
                          delete n.manualUsername;
                          delete n.manualPassword;
                          return n;
                        });
                      }}
                      className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs transition-all ${
                        credMode === 'auto'
                          ? 'bg-orange-500 text-white shadow-sm font-black'
                          : 'text-gray-600 dark:text-gray-400 hover:text-navy-800 dark:hover:text-white font-bold'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      توليد تلقائي للكود والباسورد (مستحسن)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCredMode('manual')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs transition-all ${
                        credMode === 'manual'
                          ? 'bg-navy-600 dark:bg-amber-600 text-white shadow-sm font-black'
                          : 'text-gray-600 dark:text-gray-400 hover:text-navy-800 dark:hover:text-white font-bold'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      تحديد يدوي للكود والباسورد
                    </button>
                  </div>
                </div>

                {/* ── Mode 1: Auto Mode Preview Banner ── */}
                {credMode === 'auto' && (
                  <div className="bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-navy-800 dark:text-amber-200">كود الدخول التلقائي المتوقع:</p>
                        {form.academic_stage ? (
                          previewLoading ? (
                            <span className="font-mono text-sm text-amber-500 dark:text-amber-400 font-bold animate-pulse inline-block mt-0.5">جاري استخراج الكود...</span>
                          ) : (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono font-black text-orange-600 dark:text-amber-400 text-lg tracking-widest">{previewUsername || '...'}</span>
                              <span className="text-[10px] bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold px-2 py-0.5 rounded-md">متاح</span>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-amber-700 dark:text-amber-300/80 font-medium block mt-0.5">اختر المرحلة الدراسية بالأسفل لاحتساب الكود التسلسلي تلقائياً</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 bg-white/90 dark:bg-[#1F1C2C] border border-amber-200/80 dark:border-amber-800/40 rounded-xl px-3 py-2 sm:max-w-[210px]">
                      🔒 سيتم توليد كلمة مرور عشوائية من 6 أرقام وسيعرضها النظام فور الحفظ
                    </div>
                  </div>
                )}

                {/* ── Mode 2: Manual Credentials Inputs ── */}
                {credMode === 'manual' && (
                  <div className="space-y-3 bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-4">
                    <p className="text-xs font-black text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                      <Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      إدخال كود الدخول وكلمة المرور يدوياً:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-navy-800 dark:text-gray-200 mb-1">اسم المستخدم (الكود) <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={form.manualUsername}
                          onChange={e => { setForm({ ...form, manualUsername: e.target.value }); clearError('manualUsername'); }}
                          className={`input-field font-mono font-bold tracking-wider text-sm ${formErrors.manualUsername ? 'border-red-400 focus:ring-red-300' : ''}`}
                          placeholder="مثال: H050 أو STU101"
                          dir="ltr"
                          autoComplete="off"
                        />
                        <FieldError error={formErrors.manualUsername} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-navy-800 dark:text-gray-200 mb-1">كلمة المرور <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={form.manualPassword}
                          onChange={e => { setForm({ ...form, manualPassword: e.target.value }); clearError('manualPassword'); }}
                          className={`input-field font-mono text-sm ${formErrors.manualPassword ? 'border-red-400 focus:ring-red-300' : ''}`}
                          placeholder="5 أحرف أو أرقام على الأقل"
                          dir="ltr"
                          autoComplete="new-password"
                        />
                        <FieldError error={formErrors.manualPassword} />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Field: Student Name ── */}
                <div>
                  <label className="block text-xs font-black text-navy-800 dark:text-gray-200 mb-1.5">
                    اسم الطالب الكامل <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={form.name}
                    onChange={e => { setForm({ ...form, name: e.target.value }); clearError('name'); }}
                    className={`input-field font-bold text-sm ${formErrors.name ? 'border-red-400 focus:ring-red-300' : ''}`}
                    placeholder="مثال: أحمد محمد علي"
                    autoFocus
                  />
                  <FieldError error={formErrors.name} />
                </div>

                {/* ── Field: Stage + Gender ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-navy-800 dark:text-gray-200 mb-1.5">
                      المرحلة الدراسية <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.academic_stage}
                      onChange={e => { setForm({ ...form, academic_stage: e.target.value }); clearError('academic_stage'); }}
                      className={`input-field font-bold text-sm ${formErrors.academic_stage ? 'border-red-400 focus:ring-red-300' : ''}`}
                    >
                      <option value="">— اختر المرحلة الدراسية —</option>
                      {STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <FieldError error={formErrors.academic_stage} />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-navy-800 dark:text-gray-200 mb-1.5">
                      الجنس (النوع)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, gender: 'ذكر' })}
                        className={`py-2 px-3 rounded-xl text-xs transition-all border ${
                          form.gender === 'ذكر'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-bold'
                            : 'bg-white dark:bg-[#1F1C2C] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-amber-500/10 hover:bg-gray-50 dark:hover:bg-[#272439] font-bold'
                        }`}
                      >
                        👨 ذكر
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, gender: 'أنثى' })}
                        className={`py-2 px-3 rounded-xl text-xs transition-all border ${
                          form.gender === 'أنثى'
                            ? 'bg-pink-600 text-white border-pink-600 shadow-sm font-bold'
                            : 'bg-white dark:bg-[#1F1C2C] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-amber-500/10 hover:bg-gray-50 dark:hover:bg-[#272439] font-bold'
                        }`}
                      >
                        👩 أنثى
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Field: Phones ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-navy-800 dark:text-gray-200 mb-1">
                      هاتف الطالب <span className="text-gray-400 font-normal">(اختياري)</span>
                    </label>
                    <div className="relative">
                      <Smartphone className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={form.phone}
                        onChange={e => { setForm({ ...form, phone: e.target.value }); clearError('phone'); }}
                        className={`input-field pr-9 text-sm font-mono ${formErrors.phone ? 'border-red-400 focus:ring-red-300' : ''}`}
                        placeholder="01xxxxxxxxx"
                        dir="ltr"
                      />
                    </div>
                    <FieldError error={formErrors.phone} />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-800 dark:text-gray-200 mb-1">
                      هاتف ولي الأمر <span className="text-gray-400 font-normal">(اختياري)</span>
                    </label>
                    <div className="relative">
                      <Smartphone className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={form.parent_phone}
                        onChange={e => { setForm({ ...form, parent_phone: e.target.value }); clearError('parent_phone'); }}
                        className={`input-field pr-9 text-sm font-mono ${formErrors.parent_phone ? 'border-red-400 focus:ring-red-300' : ''}`}
                        placeholder="01xxxxxxxxx"
                        dir="ltr"
                      />
                    </div>
                    <FieldError error={formErrors.parent_phone} />
                  </div>
                </div>

                {/* ── Submit & Action Buttons ── */}
                <div className="pt-3 border-t border-gray-100 dark:border-amber-500/10 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="submit"
                    disabled={createMut.isPending}
                    className="btn-primary w-full sm:flex-1 py-3 px-5 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {createMut.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري حفظ وإضافة الطالب...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>إضافة الطالب وحفظ البيانات</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForm(emptyForm);
                      setFormErrors({});
                      nameInputRef.current?.focus();
                    }}
                    className="btn-secondary w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-bold transition-colors"
                  >
                    مسح الحقول
                  </button>
                </div>
              </form>
            </div>

            {/* Quick Tips & Excel Shortcut */}
            <div className="card !p-4 bg-white dark:bg-[#17151F] border border-gray-200 dark:border-amber-500/10 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-navy-800 dark:text-gray-100 text-xs sm:text-sm">هل لديك ملف إكسيل يحتوي على مئات الطلاب؟</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">يمكنك استخدام ميزة استيراد الإكسيل لرفع جميع الطلاب دفعة واحدة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/${baseRole}/students`)}
                className="btn-secondary text-xs !py-2 !px-3 font-bold flex items-center gap-1.5 flex-shrink-0"
              >
                <Layers className="w-3.5 h-3.5" />
                استيراد من صفحة الطلاب
              </button>
            </div>

          </div>

          {/* ════════════ Right Column: Session Students & Credentials (5 cols) ════════════ */}
          <div className="lg:col-span-5 space-y-4 sm:space-y-5 order-2 lg:sticky lg:top-0">
            
            {/* Session Card Panel */}
            <div className="card !p-0 bg-white dark:bg-[#17151F] border border-gray-200 dark:border-amber-500/10 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-amber-500/10 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-[#17151F]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-navy-800 dark:text-gray-100 text-sm">سجل طلاب الجلسة الحالية</h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">بيانات دخول الطلاب المضافين الآن</p>
                  </div>
                </div>

                {sessionStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyAllSession}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/60 text-orange-700 dark:text-orange-300 text-xs font-bold transition-colors border border-orange-200 dark:border-orange-800/40"
                    title="نسخ جميع بيانات الدخول المضافة في هذه الجلسة"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    نسخ الكل
                  </button>
                )}
              </div>

              {/* Student Cards List */}
              <div className="p-3 sm:p-5 space-y-3 max-h-[500px] sm:max-h-[600px] overflow-y-auto">
                {sessionStudents.length === 0 ? (
                  <div className="text-center py-10 sm:py-14 px-4">
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-3 text-orange-500 dark:text-orange-400">
                      <UserPlus className="w-7 h-7" />
                    </div>
                    <h4 className="font-black text-navy-800 dark:text-gray-100 text-sm mb-1">لم يتم إضافة طلاب بعد في هذه الجلسة</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs mx-auto">
                      بمجرد إضافة أي طالب من النموذج، ستظهر بطاقة بيانات الدخول الخاصة به هنا مباشرة لنسخها أو مشاركتها عبر واتساب.
                    </p>
                  </div>
                ) : (
                  sessionStudents.map((s, idx) => {
                    const pwd = s.generated_password || s.plain_password || s.password || '—';
                    const isPwdVisible = visiblePasswords[s.id];
                    const isCopied = copiedId === s.id;

                    return (
                      <div
                        key={s.id || idx}
                        className="bg-gray-50/90 dark:bg-[#1F1C2C] hover:bg-orange-50/30 dark:hover:bg-[#272439] border border-gray-200 dark:border-amber-500/10 rounded-2xl p-3.5 sm:p-4 transition-all duration-200 animate-in fade-in slide-in-from-top-2"
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 ml-1">#{sessionStudents.length - idx}</span>
                            <h4 className="font-black text-navy-800 dark:text-white text-sm inline-block">{s.name}</h4>
                            {s.academic_stage && (
                              <span className={`block sm:inline-block sm:mr-2 text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 sm:mt-0 ${STAGE_COLORS[s.academic_stage] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200'}`}>
                                {s.academic_stage}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleWhatsAppShare(s)}
                              className="p-1.5 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/60 border border-green-200/50 dark:border-green-800/40 transition-colors"
                              title="إرسال البيانات عبر واتساب"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`كود الطالب: ${s.username}\nكلمة المرور: ${pwd}`, s.id)}
                              className={`p-1.5 rounded-lg transition-colors border ${
                                isCopied
                                  ? 'bg-green-600 text-white border-green-600'
                                  : 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/60 border-orange-200/50 dark:border-orange-800/40'
                              }`}
                              title="نسخ كود الطالب وكلمة المرور"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Credentials box */}
                        <div className="bg-white dark:bg-[#17151F] border border-gray-200 dark:border-amber-500/10 p-3 rounded-xl space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 dark:text-gray-400 font-bold">كود الطالب (اسم المستخدم):</span>
                            <div className="flex items-center gap-1.5 font-mono font-black text-orange-600 dark:text-orange-400 tracking-wider">
                              <span>{s.username}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(s.username)}
                                className="text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                                title="نسخ الكود"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-amber-500/10">
                            <span className="text-gray-500 dark:text-gray-400 font-bold">كلمة المرور:</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-green-700 dark:text-green-400 tracking-widest text-sm">
                                {isPwdVisible ? pwd : '••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(s.id)}
                                className="text-gray-400 hover:text-navy-700 dark:hover:text-white transition-colors"
                                title={isPwdVisible ? 'إخفاء' : 'إظهار'}
                              >
                                {isPwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(pwd)}
                                className="text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                title="نسخ كلمة المرور"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Stages Distribution Card */}
            <div className="card !p-4 sm:!p-5 bg-white dark:bg-[#17151F] border border-gray-200 dark:border-amber-500/10 rounded-2xl shadow-sm">
              <h4 className="font-black text-navy-800 dark:text-gray-100 text-xs sm:text-sm flex items-center gap-2 mb-3">
                <GraduationCap className="w-4 h-4 text-orange-500" />
                توزيع الطلاب حسب المراحل الدراسية
              </h4>
              <div className="space-y-1.5">
                {STAGES.map(stage => {
                  const count = stageCountsData.find(s => s.stage === stage)?.count ?? 0;
                  return (
                    <div
                      key={stage}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1F1C2C] transition-colors"
                    >
                      <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{stage}</span>
                      <span className="font-mono font-bold bg-gray-100 dark:bg-[#1F1C2C] text-navy-800 dark:text-gray-200 border border-gray-200/60 dark:border-amber-500/10 px-2.5 py-0.5 rounded-full text-[11px]">
                        {count} طالب
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

        </div>
      </div>

    </div>
  );
}
