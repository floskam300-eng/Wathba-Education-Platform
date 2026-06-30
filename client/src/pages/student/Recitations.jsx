import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, CheckCircle, XCircle, Trophy,
  ChevronLeft, AlertCircle, BarChart2, RefreshCw, Lock, Eye, Loader2, ZoomIn,
  ChevronDown, ChevronUp, X
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import ImageLightbox from '../../components/ImageLightbox';
import { withToken } from '../../lib/mediaAccess';

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
  const navigate = useNavigate();
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
  const [startingId, setStartingId] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
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

  const [showHistory, setShowHistory] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: ['student-recitation-results'],
    queryFn: () => api.get('/recitations/student/results').then(r => r.data),
  });

  const startRec = async (rec) => {
    // Block if any start is in progress OR countdown is showing OR already in take view.
    // startingId is NOT cleared until the view actually transitions to 'take' so there
    // is no window during the 3-2-1 countdown where a second button click can slip through.
    if (startingId || showCountdown || view === 'take') return;
    setStartingId(rec.id);
    submittedRef.current = false;
    try {
      const { data } = await api.get(`/recitations/${rec.id}/take`);
      setExamData(data);
      setSelectedRec(rec);

      // [REC-1 FIX] Wrap JSON.parse in try-catch: corrupt localStorage must not
      // propagate to the catch block and show a confusing "حدث خطأ" to the user.
      // Also guard against JSON.parse('null') → null (valid JSON but invalid answers shape).
      try {
        const saved = localStorage.getItem(`recitation_answers_${rec.id}`);
        const parsed = saved ? JSON.parse(saved) : {};
        setAnswers((parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {});
      } catch (_) {
        setAnswers({});
      }

      // [REC-2 FIX] Validate server_started_at before using it — an invalid/null
      // value would produce NaN from getTime(), causing setTimeLeft(NaN) and the
      // timer to render "NaN:aN".
      const startedAt = data.server_started_at ? new Date(data.server_started_at).getTime() : null;
      if (!startedAt || isNaN(startedAt)) {
        throw new Error('server_started_at مفقود أو غير صالح من الخادم');
      }
      const durationMs = (rec.duration_minutes || 0) * 60 * 1000;
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      // [CL2-FIX] Record epoch + duration so the tick loop can self-correct drift.
      timerEpochRef.current = startedAt;
      timerDurationRef.current = durationMs;
      setTimeLeft(Math.floor(remaining / 1000));

      if (data.resumed) {
        // Resuming: go directly to take view; clear the lock immediately.
        setStartingId(null);
        setView('take');
      } else {
        // New session: keep startingId set during the entire 3-2-1 countdown so
        // no other button click can fire until the view actually changes to 'take'.
        setShowCountdown(true);
        setCountdown(3);
        // startingId is cleared inside the countdown useEffect when it reaches 0.
      }
    } catch (e) {
      // On error always release the lock so the user can retry.
      setStartingId(null);
      toast.error(e.response?.data?.error || 'حدث خطأ');
    }
    // No finally — intentional. Success path clears startingId at the right moment.
  };

  // Mounted ref lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Scroll to top when entering/leaving exam view
  useEffect(() => {
    if (view === 'take' || view === 'result') {
      const el = document.querySelector('main');
      if (el) el.scrollTop = 0;
    }
  }, [view]);

  // 3-2-1 countdown
  // When countdown reaches 0: clear startingId THEN switch to 'take'.
  // This is the only place startingId is released on the success path,
  // ensuring no second click can fire during the entire countdown window.
  useEffect(() => {
    if (!showCountdown) return;
    if (countdown <= 0) {
      setStartingId(null);
      setShowCountdown(false);
      setView('take');
      return;
    }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [showCountdown, countdown]);

  const cancelCountdown = () => {
    setShowCountdown(false);
    setCountdown(3);
    setStartingId(null);
    setExamData(null);
    setSelectedRec(null);
    setAnswers({});
  };

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
        {/* Header */}
        <h1 className={`text-xl font-black flex items-center gap-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
          <BookOpen className="w-6 h-6 text-purple-500" /> التسميع
        </h1>

        {/* ── سجل تسميعاتي (always visible, collapsible) ─────────────────── */}
        {history.length > 0 && (
          <div className="card !p-0 overflow-hidden">
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={`text-sm font-bold ${dark ? 'text-[var(--dk-text-1)]' : 'text-navy-700'}`}>سجل تسميعاتي</span>
                <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>
                  {history.length}
                </span>
              </div>
              {showHistory
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showHistory && (
              <div className={`divide-y ${dark ? 'divide-[var(--dk-border)]' : 'divide-gray-100'}`}>
                {history.map(r => {
                  const isAbsent = r.is_absent === true || r.is_absent === 'true';
                  const passed = !isAbsent && r.passed;
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isAbsent ? (dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100') :
                        passed   ? (dark ? 'bg-green-900/30'          : 'bg-green-100') :
                                   (dark ? 'bg-red-900/30'            : 'bg-red-100')
                      }`}>
                        {isAbsent
                          ? <Clock className="w-4 h-4 text-gray-400" />
                          : passed
                            ? <CheckCircle className="w-4 h-4 text-green-600" />
                            : <X className="w-4 h-4 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-xs font-bold truncate ${dark ? 'text-[var(--dk-text-1)]' : 'text-navy-700'}`}>{r.title}</p>
                          {isAbsent && (
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${dark ? 'bg-[var(--dk-elevated)] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>غائب</span>
                          )}
                          {!isAbsent && passed && (
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${dark ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'}`}>ناجح</span>
                          )}
                          {!isAbsent && !passed && (
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${dark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'}`}>راسب</span>
                          )}
                        </div>
                        <p className={`text-[10px] mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                          {new Date(r.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isAbsent ? (
                          <span className={`text-xs font-black ${dark ? 'text-gray-500' : 'text-gray-400'}`}>غائب</span>
                        ) : (
                          <>
                            <span className={`text-xs font-black ${passed ? 'text-green-600' : 'text-red-500'}`}>
                              {r.score}/{r.total_score}
                            </span>
                            <button
                              onClick={() => navigate(`/student/recitation-review/${r.id}`)}
                              className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-purple-400 hover:bg-purple-900/20' : 'text-gray-400 hover:text-purple-500 hover:bg-purple-50'}`}
                              title="مراجعة الإجابات"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* List sections */}
        {(
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
                  <Section title="متاح الآن 🟢" items={open} dark={dark} cardCls={cardCls} onStart={startRec} navigate={navigate} startingId={startingId} />
                )}
                {upcoming.length > 0 && (
                  <Section title="قادم قريباً ⏳" items={upcoming} dark={dark} cardCls={cardCls} onStart={null} navigate={navigate} />
                )}
                {done.length > 0 && (
                  <Section title="أديته ✅" items={done} dark={dark} cardCls={cardCls} onStart={null} navigate={navigate} />
                )}
                {expired.length > 0 && (
                  <Section title="منتهي ❌" items={expired} dark={dark} cardCls={cardCls} onStart={null} navigate={navigate} />
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
        <button
          onClick={cancelCountdown}
          className="mt-10 px-6 py-2 rounded-full text-sm font-bold bg-white/20 hover:bg-white/30 text-white transition"
        >
          إلغاء
        </button>
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
      <>
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
            <QuestionCard key={q.id} q={q} idx={idx} answers={answers} setAnswers={setAnswers} dark={dark} onImagePress={setLightboxSrc} />
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
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </>
    );
  }

  // ── RESULT VIEW ──────────────────────────────────────────────────────────────
  if (view === 'result' && result) {
    const { score, correct, wrong, unanswered, passed, points_earned, total_score, pass_score } = result;
    return (
      <>
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

          <div className="flex gap-3">
            {result?.result?.id && (
              <button onClick={() => navigate(`/student/recitation-review/${result.result.id}`)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm bg-indigo-500 hover:bg-indigo-600 text-white transition-colors">
                <Eye className="w-4 h-4" />
                مراجعة مفصّلة
              </button>
            )}
            <button onClick={() => { setView('list'); setResult(null); submittedRef.current = false; }}
              className="flex-1 py-3 rounded-2xl font-black text-sm bg-purple-500 hover:bg-purple-600 text-white transition-colors">
              العودة للقائمة
            </button>
          </div>
        </div>
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </>
    );
  }

  return null;
}

function Section({ title, items, dark, cardCls, onStart, navigate, startingId = null }) {
  return (
    <div>
      <h2 className={`font-black mb-3 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{title}</h2>
      <div className="space-y-3">
        {items.map(rec => {
          const status = getStatus(rec);
          const isStarting = startingId === rec.id;
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
                  disabled={!!startingId}
                  className="flex-shrink-0 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-60 text-white rounded-xl text-sm font-black transition-colors flex items-center gap-1.5">
                  {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {isStarting ? 'جاري...' : 'ابدأ'}
                </button>
              )}
              {status === 'upcoming' && (
                <Lock className={`w-4 h-4 flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
              )}
              {status === 'done' && (
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {rec.result_id && navigate && (
                    <button
                      onClick={() => navigate(`/student/recitation-review/${rec.result_id}`)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${dark ? 'bg-indigo-900/30 text-indigo-300 hover:bg-indigo-900/50' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      مراجعة
                    </button>
                  )}
                  {rec.allow_retry && onStart && (
                    <button
                      onClick={() => onStart(rec)}
                      disabled={!!startingId}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${dark ? 'bg-purple-900/30 text-purple-300 hover:bg-purple-900/50' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      إعادة
                    </button>
                  )}
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
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

function QuestionCard({ q, idx, answers, setAnswers, dark, onImagePress }) {
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
        <div className="relative mb-3">
          <img
            src={withToken(q.question_image_url)}
            alt="question"
            className={`w-full max-h-64 object-contain rounded-xl border ${onImagePress ? 'cursor-zoom-in' : ''}`}
            onClick={onImagePress ? () => onImagePress(withToken(q.question_image_url)) : undefined}
          />
          {onImagePress && (
            <button
              onClick={() => onImagePress(withToken(q.question_image_url))}
              className="absolute top-2 left-2 bg-black/50 hover:bg-black/70 text-white rounded-lg p-1.5 transition-colors"
              title="تكبير الصورة"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {isImgMulti ? (
        <div className="space-y-2">
          {/* Shared options — hide when options are just the letters themselves (auto-generated) */}
          {options.some(o => o.text !== o.letter) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {options.map(({ letter, text }) => (
                <span key={letter} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                  {letter}: {text}
                </span>
              ))}
            </div>
          )}
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
