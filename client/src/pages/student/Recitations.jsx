import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Clock, CheckCircle, XCircle, Flame, Trophy,
  ChevronLeft, AlertCircle, BarChart2, RefreshCw, Lock
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

function getStatus(rec) {
  const now = new Date();
  // [N2-FIX] For recurring recitations: only mark "done" if the student
  // submitted WITHIN the current window (my_submitted_at >= start_date).
  // Without this check a student who completed week-1 would still show
  // "done" in week-2's fresh window.
  const doneInCurrentWindow = rec.my_submitted_at &&
    (!rec.start_date || new Date(rec.my_submitted_at) >= new Date(rec.start_date));
  if (doneInCurrentWindow) return 'done';
  if (rec.start_date && new Date(rec.start_date) > now) return 'upcoming';
  if (rec.end_date && new Date(rec.end_date) < now) return 'expired';
  return 'open';
}

function CountdownBadge({ target }) {
  const [diff, setDiff] = useState(new Date(target) - new Date());
  useEffect(() => {
    const id = setInterval(() => setDiff(new Date(target) - new Date()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
      يبدأ بعد {h > 0 ? `${h}س ` : ''}{m}:{String(s).padStart(2, '0')}
    </span>
  );
}

export default function StudentRecitations() {
  const { dark } = useTheme();
  const qc = useQueryClient();
  const [view, setView] = useState('list'); // 'list' | 'take' | 'result'
  const [selectedRec, setSelectedRec] = useState(null);
  const [examData, setExamData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [showCountdown, setShowCountdown] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // [CL3-FIX] startingRef prevents double-click spawning multiple countdowns.
  // startRec is async; without this lock a second tap before the API responds
  // would start a second countdown sequence on top of the first.
  const [starting, setStarting] = useState(false);
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef(null);
  // [CL2-FIX] Store the epoch when the session was started so the timer can
  // correct for setInterval/setTimeout drift (common when tab is backgrounded).
  const timerEpochRef = useRef(null);
  const timerDurationRef = useRef(null);

  const { data: recitations = [], isLoading } = useQuery({
    queryKey: ['student-recitations'],
    queryFn: () => api.get('/recitations/student/list').then(r => r.data),
  });

  const { data: streak } = useQuery({
    queryKey: ['student-recitation-streak'],
    queryFn: () => api.get('/recitations/student/streak').then(r => r.data),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['student-recitation-results'],
    queryFn: () => api.get('/recitations/student/results').then(r => r.data),
    enabled: view === 'history',
  });

  const startRec = async (rec) => {
    // [CL3-FIX] Prevent double-click: if a start is already in progress, bail out.
    if (starting) return;
    setStarting(true);
    submittedRef.current = false;
    try {
      const { data } = await api.get(`/recitations/${rec.id}/take`);
      setExamData(data);
      setSelectedRec(rec);

      // Restore answers from localStorage
      const saved = localStorage.getItem(`recitation_answers_${rec.id}`);
      setAnswers(saved ? JSON.parse(saved) : {});

      // Server-authoritative timer
      const startedAt = new Date(data.server_started_at).getTime();
      const durationMs = rec.duration_minutes * 60 * 1000;
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      // [CL2-FIX] Record epoch + duration so the tick loop can self-correct drift.
      timerEpochRef.current = startedAt;
      timerDurationRef.current = durationMs;
      setTimeLeft(Math.floor(remaining / 1000));

      if (data.resumed) {
        setView('take');
      } else {
        setShowCountdown(true);
        setCountdown(3);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'حدث خطأ');
    } finally {
      setStarting(false);
    }
  };

  // Mounted ref lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 3-2-1 countdown
  useEffect(() => {
    if (!showCountdown) return;
    if (countdown <= 0) { setShowCountdown(false); setView('take'); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [showCountdown, countdown]);

  // Main exam timer — [CL2-FIX] drift-corrected using server epoch
  // Simple setTimeout(…, 1000) drifts noticeably when the tab is backgrounded
  // (Chrome throttles timers to 1Hz in background tabs). We instead compute
  // the true remaining seconds from the original server_started_at epoch on
  // every tick, so accumulated drift is self-correcting rather than additive.
  useEffect(() => {
    if (view !== 'take' || timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmit(true); return; }
    timerRef.current = setTimeout(() => {
      if (timerEpochRef.current !== null && timerDurationRef.current !== null) {
        const elapsed = Date.now() - timerEpochRef.current;
        const trueLeft = Math.max(0, Math.floor((timerDurationRef.current - elapsed) / 1000));
        setTimeLeft(trueLeft);
      } else {
        setTimeLeft(t => Math.max(0, t - 1));
      }
    }, 1000);
    return () => clearTimeout(timerRef.current);
  }, [view, timeLeft]);

  // Save answers to localStorage
  useEffect(() => {
    if (view === 'take' && selectedRec) {
      localStorage.setItem(`recitation_answers_${selectedRec.id}`, JSON.stringify(answers));
    }
  }, [answers, view, selectedRec]);

  // Cleanup on unmount: reset submittedRef; clear saved answers only if submitted
  useEffect(() => {
    return () => {
      if (submittedRef.current && selectedRec?.id) {
        localStorage.removeItem(`recitation_answers_${selectedRec.id}`);
      }
      submittedRef.current = false;
    };
  }, [selectedRec]);

  // Keepalive on tab close
  useEffect(() => {
    if (view !== 'take' || !selectedRec) return;
    const handleUnload = () => {
      if (submittedRef.current) return;
      // [CL1-FIX] Use the correct localStorage key 'wathba_token' that AuthContext
      // and api.js both use. The previous key 'token' was never set, so the
      // keepalive always sent "Authorization: Bearer null" → server rejected 401.
      const token = localStorage.getItem('wathba_token');
      // [CL4-FIX] Include X-Tenant-Slug so multi-tenant servers can resolve the
      // tenant. Axios interceptor injects this automatically, but fetch() doesn't
      // use interceptors — the same gap was fixed in Exams.jsx keepalive (M-15).
      const tenantSlug = localStorage.getItem('wathba_teacher_slug') || '';
      // [R4-FIX] sendBeacon does not support custom headers (Authorization),
      // so the server always rejected it with 401. Use fetch with keepalive:true
      // instead — it supports auth headers and survives page unload.
      const qs2 = examData?.questions || [];
      const payloadUnload = JSON.stringify({
        answers: qs2.map(q => ({
          question_id: q.id,
          answer: q.question_type === 'image_multi'
            ? JSON.stringify(answers[q.id] || {})
            : (answers[q.id] || null),
        }))
      });
      fetch(`/api/recitations/${selectedRec.id}/submit`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
        },
        body: payloadUnload,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [view, selectedRec, answers, examData]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    if (!mountedRef.current) return;
    setSubmitting(true);
    clearTimeout(timerRef.current);

    const qs = examData?.questions || [];
    const payload = qs.map(q => ({
      question_id: q.id,
      answer: q.question_type === 'image_multi'
        ? JSON.stringify(answers[q.id] || {})
        : (answers[q.id] || null),
    }));

    try {
      const { data } = await api.post(`/recitations/${selectedRec.id}/submit`, { answers: payload });
      if (!mountedRef.current) return;
      localStorage.removeItem(`recitation_answers_${selectedRec.id}`);
      setResult(data);
      setView('result');
      qc.invalidateQueries(['student-recitations']);
      qc.invalidateQueries(['student-recitation-streak']);
    } catch (e) {
      if (!mountedRef.current) return;
      submittedRef.current = false;
      setSubmitting(false);
      const data = e.response?.data || {};
      const msg = data.error || 'حدث خطأ أثناء التسليم';
      if (data.already_submitted) {
        toast('تم تسليم التسميع بالفعل', { icon: 'ℹ️' });
        localStorage.removeItem(`recitation_answers_${selectedRec?.id}`);
        setView('list');
        qc.invalidateQueries(['student-recitations']);
      } else if (data.timer_expired) {
        // [R8-FIX] Server rejected because time ran out — don't leave student stuck
        toast.error('انتهى وقت التسميع');
        localStorage.removeItem(`recitation_answers_${selectedRec?.id}`);
        setView('list');
        qc.invalidateQueries(['student-recitations']);
      } else {
        toast.error(msg);
      }
    }
  }, [examData, answers, selectedRec, submitting, qc]);

  const cardCls = dark
    ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)] rounded-2xl p-4'
    : 'bg-white border border-gray-100 rounded-2xl p-4 shadow-sm';

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === 'list' || view === 'history') {
    const open = recitations.filter(r => getStatus(r) === 'open');
    const upcoming = recitations.filter(r => getStatus(r) === 'upcoming');
    const done = recitations.filter(r => getStatus(r) === 'done');
    const expired = recitations.filter(r => getStatus(r) === 'expired');

    return (
      <div className="p-4 lg:p-6 space-y-6" dir="rtl">
        {/* Header + streak */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={`text-xl font-black flex items-center gap-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
            <BookOpen className="w-6 h-6 text-purple-500" /> التسميع
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setView(view === 'history' ? 'list' : 'history')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${view === 'history' ? 'bg-purple-500 text-white' : dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-600 hover:bg-gray-100'}`}>
              <BarChart2 className="w-4 h-4 inline ml-1" />سجلي
            </button>
          </div>
        </div>

        {/* Streak card */}
        {streak && (
          <div className={`rounded-2xl p-4 flex items-center gap-4 ${dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]' : 'bg-gradient-to-l from-orange-50 to-amber-50 border border-orange-100'}`}>
            <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center flex-shrink-0">
              <Flame className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-black text-2xl ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                {streak.current_streak} يوم 🔥
              </p>
              <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                أعلى streak: <strong>{streak.max_streak}</strong> يوم · إجمالي: <strong>{streak.total_completed}</strong> تسميع
              </p>
            </div>
          </div>
        )}

        {/* History tab */}
        {view === 'history' && (
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className={`${cardCls} text-center py-10`}>
                <BarChart2 className={`w-12 h-12 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
                <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد نتائج بعد</p>
              </div>
            ) : history.map(r => (
              <div key={r.id} className={`${cardCls} flex items-center justify-between gap-3`}>
                <div>
                  <p className={`font-bold text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{r.title}</p>
                  <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                    {new Date(r.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-left">
                  <span className={`font-black text-xl ${r.passed ? 'text-green-600' : 'text-red-500'}`}>
                    {r.score}/{r.total_score}
                  </span>
                  <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                    {r.passed ? '✅ ناجح' : '❌ راسب'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List sections */}
        {view === 'list' && (
          <div className="space-y-6">
            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className={`${cardCls} h-24 animate-pulse`} />)
            ) : recitations.length === 0 ? (
              <div className={`${cardCls} text-center py-16`}>
                <BookOpen className={`w-16 h-16 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
                <p className={`font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد تسميعات متاحة</p>
              </div>
            ) : (
              <>
                {open.length > 0 && (
                  <Section title="متاح الآن 🟢" items={open} dark={dark} cardCls={cardCls} onStart={startRec} />
                )}
                {upcoming.length > 0 && (
                  <Section title="قادم قريباً ⏳" items={upcoming} dark={dark} cardCls={cardCls} onStart={null} />
                )}
                {done.length > 0 && (
                  <Section title="أديته ✅" items={done} dark={dark} cardCls={cardCls} onStart={null} />
                )}
                {expired.length > 0 && (
                  <Section title="منتهي ❌" items={expired} dark={dark} cardCls={cardCls} onStart={null} />
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── COUNTDOWN OVERLAY ────────────────────────────────────────────────────────
  if (showCountdown) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
        <p className="text-white/80 text-lg font-bold mb-4">يبدأ التسميع بعد...</p>
        <div className="text-white font-black" style={{ fontSize: 120, lineHeight: 1 }}>{countdown}</div>
        <p className="text-white/60 text-sm mt-6">{selectedRec?.title}</p>
      </div>
    );
  }

  // ── TAKE VIEW ────────────────────────────────────────────────────────────────
  if (view === 'take' && examData) {
    const questions = examData.questions || [];
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const urgent = timeLeft < 60;
    const answered = questions.filter(q => {
      if (q.question_type === 'image_multi') {
        const sub = answers[q.id] || {};
        return Object.keys(sub).length > 0;
      }
      return !!answers[q.id];
    }).length;

    return (
      <div className={`min-h-screen ${dark ? 'bg-[var(--dk-bg)]' : 'bg-gray-50'}`} dir="rtl">
        {/* Sticky timer header */}
        <div className={`sticky top-0 z-20 border-b px-4 py-3 flex items-center justify-between ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-200 shadow-sm'}`}>
          <div>
            <p className={`font-black text-sm truncate max-w-[200px] ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{selectedRec?.title}</p>
            <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{answered}/{questions.length} إجابة</p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xl tabular-nums ${
            urgent ? 'bg-red-100 text-red-600 animate-pulse' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)]' : 'bg-purple-50 text-purple-700'
          }`}>
            <Clock className="w-5 h-5" />
            {mins}:{String(secs).padStart(2, '0')}
          </div>
        </div>

        {/* Questions */}
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {questions.map((q, idx) => (
            <QuestionCard key={q.id} q={q} idx={idx} answers={answers} setAnswers={setAnswers} dark={dark} />
          ))}

          <button
            onClick={() => {
              if (window.confirm(`هل أنت متأكد من تسليم التسميع؟\nأجبت على ${answered} من ${questions.length} أسئلة`)) {
                handleSubmit(false);
              }
            }}
            disabled={submitting}
            className="w-full py-4 rounded-2xl font-black text-lg text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-60 transition-colors shadow-lg mt-4">
            {submitting ? <><RefreshCw className="w-5 h-5 inline ml-2 animate-spin" />جاري التسليم...</> : 'تسليم التسميع'}
          </button>
        </div>
      </div>
    );
  }

  // ── RESULT VIEW ──────────────────────────────────────────────────────────────
  if (view === 'result' && result) {
    const { score, correct, wrong, unanswered, passed, points_earned, total_score, pass_score, review } = result;
    return (
      <div className={`min-h-screen ${dark ? 'bg-[var(--dk-bg)]' : 'bg-gray-50'} p-4 lg:p-6`} dir="rtl">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Score card */}
          <div className={`rounded-2xl p-6 text-center ${passed ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-red-500 to-rose-600'} text-white shadow-xl`}>
            <div className="text-6xl mb-2">{passed ? '🎉' : '📚'}</div>
            <div className="text-5xl font-black mb-1">{score}<span className="text-2xl font-semibold opacity-70">/{total_score}</span></div>
            <p className="text-xl font-bold mb-1">{passed ? 'أحسنت! نجحت في التسميع' : 'حاول أكثر في المرة القادمة'}</p>
            <p className="text-white/80 text-sm">درجة النجاح: {pass_score}/{total_score}</p>
            {points_earned > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2">
                <Trophy className="w-4 h-4" />
                <span className="font-black">+{points_earned} نقطة</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'صحيح', value: correct, color: 'green', icon: '✅' },
              { label: 'خطأ', value: wrong, color: 'red', icon: '❌' },
              { label: 'بلا إجابة', value: unanswered, color: 'gray', icon: '⬜' },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className={cardCls + ' text-center'}>
                <div className="text-2xl">{icon}</div>
                <div className={`text-2xl font-black text-${color}-600`}>{value}</div>
                <div className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{label}</div>
              </div>
            ))}
          </div>

          {/* Streak notification */}
          {streak && streak.current_streak > 0 && (
            <div className={`rounded-2xl p-4 flex items-center gap-3 ${dark ? 'bg-orange-900/30 border border-orange-700/40' : 'bg-orange-50 border border-orange-200'}`}>
              <Flame className="w-8 h-8 text-orange-500 flex-shrink-0" />
              <div>
                <p className={`font-black ${dark ? 'text-orange-300' : 'text-orange-700'}`}>Streak: {streak.current_streak} يوم! 🔥</p>
                <p className={`text-xs ${dark ? 'text-orange-400' : 'text-orange-500'}`}>استمر على الانتظام لتكسر رقمك القياسي</p>
              </div>
            </div>
          )}

          {/* Review */}
          {review && review.length > 0 && (
            <div className="space-y-3">
              <h3 className={`font-black text-lg ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>مراجعة الإجابات</h3>
              {review.map((q, idx) => (
                <div key={q.id} className={`${cardCls} border-r-4 ${q.is_correct ? 'border-green-400' : q.student_answer ? 'border-red-400' : 'border-gray-300'}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-black flex items-center justify-center flex-shrink-0">{idx+1}</span>
                    <div className="flex-1 min-w-0">
                      {q.question_text && <p className={`text-sm font-semibold ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{q.question_text}</p>}
                    </div>
                  </div>

                  {q.question_image_url && (
                    <img src={q.question_image_url} alt="question" className="w-full max-h-40 object-contain rounded-xl border mb-2 mr-8" style={{ maxWidth: 'calc(100% - 2rem)' }} />
                  )}

                  {q.question_type === 'image_multi' ? (
                    <div className="mr-8 space-y-2">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {[['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([,v]) => v).map(([l, val]) => (
                          <span key={l} className={`text-xs px-2 py-0.5 rounded-lg ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>{l}: {val}</span>
                        ))}
                      </div>
                      {(q.sub_results || []).map(sub => (
                        <div key={sub.label} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${sub.is_correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          <span className="font-black">{sub.label}</span>
                          <span>← إجابتك: <strong>{sub.student_answer || 'لم تُجب'}</strong></span>
                          {!sub.is_correct && <span className="opacity-70">· الصحيح: <strong>{sub.correct}</strong></span>}
                          <span className="mr-auto">{sub.is_correct ? '✓' : '✗'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mr-8">
                      {[['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([,v]) => v).map(([l, val]) => {
                        const isCorrect = l === q.correct_answer_letter;
                        const isStudentAnswer = l === q.student_answer;
                        return (
                          <span key={l} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${
                            isCorrect ? 'bg-green-100 text-green-700 ring-1 ring-green-400' :
                            isStudentAnswer && !isCorrect ? 'bg-red-100 text-red-700 ring-1 ring-red-400' :
                            dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {l}: {val}
                            {isCorrect && ' ✓'}
                            {isStudentAnswer && !isCorrect && ' ✗'}
                          </span>
                        );
                      })}
                      {!q.student_answer && (
                        <p className="w-full text-xs text-gray-400 mt-1">
                          {`لم يتم الإجابة · الصحيح: `}
                          {q.correct_answer_letter === 'A' ? (q.option_a || 'A') :
                           q.correct_answer_letter === 'B' ? (q.option_b || 'B') :
                           q.correct_answer_letter === 'C' ? (q.option_c || 'C') :
                           q.correct_answer_letter === 'D' ? (q.option_d || 'D') :
                           q.correct_answer_letter}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button onClick={() => { setView('list'); setResult(null); submittedRef.current = false; }}
            className="w-full py-3 rounded-2xl font-black text-sm bg-purple-500 hover:bg-purple-600 text-white transition-colors">
            العودة للقائمة
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function Section({ title, items, dark, cardCls, onStart }) {
  return (
    <div>
      <h2 className={`font-black mb-3 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{title}</h2>
      <div className="space-y-3">
        {items.map(rec => {
          const status = getStatus(rec);
          return (
            <div key={rec.id} className={`${cardCls} flex items-center justify-between gap-3`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  status === 'open' ? 'bg-purple-100' :
                  status === 'done' ? 'bg-green-100' :
                  status === 'upcoming' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <BookOpen className={`w-5 h-5 ${
                    status === 'open' ? 'text-purple-600' :
                    status === 'done' ? 'text-green-600' :
                    status === 'upcoming' ? 'text-blue-600' : 'text-gray-400'
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold text-sm truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{rec.title}</p>
                  <div className={`flex items-center gap-2 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'} flex-wrap`}>
                    <span><Clock className="w-3 h-3 inline ml-0.5" />{rec.duration_minutes} دقيقة</span>
                    <span>{rec.question_count} سؤال</span>
                    {rec.academic_stage && <span className="bg-purple-100 text-purple-700 px-1.5 rounded font-semibold">{rec.academic_stage}</span>}
                    {status === 'upcoming' && rec.start_date && <CountdownBadge target={rec.start_date} />}
                    {status === 'done' && (
                      <span className={`font-black ${rec.my_passed ? 'text-green-600' : 'text-red-500'}`}>
                        {rec.my_score}/{rec.total_score}
                      </span>
                    )}
                    {status === 'expired' && <span className="text-red-500 font-semibold">انتهى الوقت</span>}
                  </div>
                </div>
              </div>

              {status === 'open' && onStart && (
                <button onClick={() => onStart(rec)}
                  className="flex-shrink-0 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-black transition-colors">
                  ابدأ
                </button>
              )}
              {status === 'upcoming' && (
                <Lock className={`w-4 h-4 flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
              )}
              {status === 'done' && (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              )}
              {status === 'expired' && (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionCard({ q, idx, answers, setAnswers, dark }) {
  const options = [
    q.option_a && { letter: 'A', text: q.option_a },
    q.option_b && { letter: 'B', text: q.option_b },
    q.option_c && { letter: 'C', text: q.option_c },
    q.option_d && { letter: 'D', text: q.option_d },
  ].filter(Boolean);

  const isImgMulti = q.question_type === 'image_multi';
  const selected = answers[q.id];
  const subAnswers = isImgMulti ? (selected || {}) : {};
  const hasAny = isImgMulti ? Object.keys(subAnswers).length > 0 : !!selected;

  const cardBorder = hasAny
    ? (dark ? 'border-purple-500/50' : 'border-purple-200')
    : (dark ? 'border-[var(--dk-border)]' : 'border-gray-100');

  return (
    <div className={`rounded-2xl p-4 border transition-all ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white shadow-sm'} ${cardBorder}`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-sm font-black flex items-center justify-center flex-shrink-0">{idx + 1}</span>
        <div className="flex-1 min-w-0">
          {q.question_text && (
            <p className={`font-semibold text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}>{q.question_text}</p>
          )}
        </div>
      </div>

      {q.question_image_url && (
        <img src={q.question_image_url} alt="question" className="w-full max-h-64 object-contain rounded-xl border mb-3" />
      )}

      {isImgMulti ? (
        <div className="space-y-2">
          {/* Shared options */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {options.map(({ letter, text }) => (
              <span key={letter} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                {letter}: {text}
              </span>
            ))}
          </div>
          {/* Sub-questions */}
          {(q.sub_questions || []).map(sub => {
            const subSel = subAnswers[sub.label];
            return (
              <div key={sub.label} className={`rounded-xl p-3 border ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-sm font-bold mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  البند {sub.label}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {options.map(({ letter }) => {
                    const isSel = subSel === letter;
                    return (
                      <button key={letter}
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [sub.label]: letter } }))}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                          isSel
                            ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                            : dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text)] hover:border-purple-400' : 'bg-white border-gray-300 text-gray-700 hover:border-purple-300'
                        }`}>
                        {letter}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 mr-10">
          {options.map(({ letter, text }) => {
            const isSelected = selected === letter;
            return (
              <button key={letter} onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                className={`w-full text-right flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                  isSelected
                    ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                    : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] hover:border-purple-400' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-white text-purple-600'}`}>{letter}</span>
                {text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
