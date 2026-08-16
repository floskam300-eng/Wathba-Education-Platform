import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, CheckCircle, XCircle, Trophy,
  ChevronLeft, ChevronRight, AlertCircle, BarChart2, RefreshCw, Lock, Eye, Loader2, ZoomIn,
  ChevronDown, ChevronUp, X
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import ImageLightbox from '../../components/ImageLightbox';
import { withToken } from '../../lib/mediaAccess';
import QuestionImage from '../../components/ui/QuestionImage';
import { toUTCDate, getServerNow, getServerNowMs, formatEgyptDateTime } from '../../lib/dateUtils';

function getStatus(rec) {
  const now = getServerNow();
  const startDate = toUTCDate(rec.start_date);
  const endDate = toUTCDate(rec.end_date);
  const mySubmittedAt = toUTCDate(rec.my_submitted_at);

  // For recurring recitations: only mark "done" if the student submitted within current window
  const doneInCurrentWindow = mySubmittedAt && (!startDate || mySubmittedAt >= startDate);
  if (doneInCurrentWindow) return 'done';
  if (startDate && startDate > now) return 'upcoming';
  if (endDate && endDate < now) return 'expired';
  return 'open';
}

function CountdownBadge({ target, onExpire }) {
  const targetDate = toUTCDate(target);
  const calcDiff = () => targetDate ? targetDate.getTime() - getServerNowMs() : 0;
  const [diff, setDiff] = useState(calcDiff);

  useEffect(() => {
    if (!targetDate) return;
    const update = () => {
      const remaining = calcDiff();
      setDiff(remaining);
      if (remaining <= 0) {
        if (onExpire) onExpire();
      }
    };
    update();
    const id = setInterval(update, 1000);
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
  // Question-by-question navigation
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef(null);
  // [CL2-FIX] Store the epoch when the session was started so the timer can
  // correct for setInterval/setTimeout drift (common when tab is backgrounded).
  const timerEpochRef = useRef(null);
  const timerDurationRef = useRef(null);
  const timerBaseClientMsRef = useRef(null);

  const { data: recitations = [], isLoading } = useQuery({
    queryKey: ['student-recitations'],
    queryFn: () => api.get('/recitations/student/list').then(r => r.data),
    staleTime: 0,
    refetchInterval: (query) => {
      const recs = query.state.data || [];
      const hasUpcoming = recs.some(r => getStatus(r) === 'upcoming');
      return hasUpcoming ? 30000 : false;
    },
  });

  const [showHistory, setShowHistory] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: ['student-recitation-results'],
    queryFn: () => api.get('/recitations/student/results').then(r => r.data),
    staleTime: 0,
  });

  const handleSubmitRef = useRef(null);

  const startRec = async (rec) => {
    // Block if any start is in progress OR countdown is showing OR already in take view.
    // startingId is NOT cleared until the view actually transitions to 'take' so there
    // is no window during the 3-2-1 countdown where a second button click can slip through.
    if (startingId || showCountdown || view === 'take') return;
    setStartingId(rec.id);
    submittedRef.current = false;
    setSubmitting(false);
    setResult(null);
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

      // Safe fallback for duration (at least 1 min, default 10)
      const durationSecs = (data.recitation?.duration_minutes || rec.duration_minutes || 10) * 60;
      let remainingSecs = durationSecs;

      if (typeof data.remaining_seconds === 'number' && !isNaN(data.remaining_seconds)) {
        remainingSecs = Math.max(0, data.remaining_seconds);
      } else if (data.server_started_at) {
        const serverNowMs = data.server_now ? new Date(data.server_now).getTime() : getServerNowMs();
        const startedAtMs = new Date(data.server_started_at).getTime();
        if (!isNaN(startedAtMs)) {
          const elapsedSecs = Math.max(0, Math.floor((serverNowMs - startedAtMs) / 1000));
          remainingSecs = Math.max(0, durationSecs - elapsedSecs);
        }
      }

      // Record monotonic baseline + initial remaining seconds to completely eliminate clock skew
      timerBaseClientMsRef.current = getServerNowMs();
      timerEpochRef.current = performance.now();
      timerDurationRef.current = remainingSecs;
      setTimeLeft(remainingSecs);

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

  // Scroll to top when entering/leaving exam view; reset question index on new take
  useEffect(() => {
    if (view === 'take' || view === 'result') {
      const el = document.querySelector('main');
      if (el) el.scrollTop = 0;
    }
    if (view === 'take') setCurrentQuestionIdx(0);
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
    setSubmitting(false);
    submittedRef.current = false;
  };

  // Main exam timer — hybrid drift-corrected using monotonic performance.now() + server wall clock
  useEffect(() => {
    if (view !== 'take' || timeLeft === null) return;
    if (timeLeft <= 0) {
      handleSubmitRef.current?.(true);
      return;
    }

    const calculateRemaining = () => {
      if (timerEpochRef.current === null || timerDurationRef.current === null) return 0;
      const perfElapsed = Math.floor((performance.now() - timerEpochRef.current) / 1000);
      const wallElapsed = timerBaseClientMsRef.current
        ? Math.floor((getServerNowMs() - timerBaseClientMsRef.current) / 1000)
        : perfElapsed;
      const effectiveElapsed = Math.max(perfElapsed, wallElapsed);
      return Math.max(0, timerDurationRef.current - effectiveElapsed);
    };

    const checkAndTick = () => {
      const trueLeft = calculateRemaining();
      setTimeLeft(trueLeft);
      if (trueLeft <= 0) {
        handleSubmitRef.current?.(true);
      }
    };

    timerRef.current = setTimeout(checkAndTick, 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' || (typeof document.hasFocus === 'function' && document.hasFocus())) {
        checkAndTick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
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

  // (Keepalive beforeunload removed to prevent unexpected zero-score submissions on network drops)

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
      setSubmitting(false);
      submittedRef.current = false;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['student-recitations'] }),
        qc.invalidateQueries({ queryKey: ['student-recitation-results'] }),
        qc.invalidateQueries({ queryKey: ['course-recitations'] }),
        qc.invalidateQueries({ queryKey: ['student-courses'] }),
      ]);
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
        qc.invalidateQueries({ queryKey: ['student-recitations'] });
        qc.invalidateQueries({ queryKey: ['student-recitation-results'] });
      } else if (data.timer_expired) {
        // [R8-FIX] Server rejected because time ran out — don't leave student stuck
        toast.error('انتهى وقت التسميع');
        localStorage.removeItem(`recitation_answers_${selectedRec?.id}`);
        setView('list');
        qc.invalidateQueries({ queryKey: ['student-recitations'] });
        qc.invalidateQueries({ queryKey: ['student-recitation-results'] });
      } else {
        toast.error(msg);
      }
    }
  }, [examData, answers, selectedRec, submitting, qc]);

  handleSubmitRef.current = handleSubmit;

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
                  const passed = !isAbsent && (r.passed === true || r.passed === 'true');
                  // Find the matching recitation from the list to get allow_retry and max attempts, fallback to row metadata
                  const matchedRec = recitations.find(rc => rc.id === r.recitation_id);
                  const recInfo = matchedRec || {
                    id: r.recitation_id,
                    title: r.title,
                    allow_retry: r.allow_retry,
                    max_retry_attempts: r.max_retry_attempts,
                    duration_minutes: r.duration_minutes,
                    my_attempt_count: r.my_attempt_count,
                  };
                  const attemptCount = parseInt(recInfo.my_attempt_count ?? r.my_attempt_count, 10) || 1;
                  const maxAttempts = (recInfo.max_retry_attempts ?? r.max_retry_attempts)
                    ? parseInt(recInfo.max_retry_attempts ?? r.max_retry_attempts, 10)
                    : null;
                  const maxReached = maxAttempts && attemptCount >= maxAttempts;
                  const allowRetry = Boolean(recInfo?.allow_retry ?? r.allow_retry);
                  // [retake-grant] An unused teacher-granted retake overrides allow_retry=false
                  // and max_retry_attempts (the server's /take endpoint treats it the same way).
                  // Source: history row falls back to matchedRec from the list query.
                  const unusedGrants = parseInt(r.unused_grants ?? recInfo?.unused_grants, 10) || 0;
                  const hasGrant = unusedGrants > 0;
                  const canRetry = !isAbsent && !passed && (allowRetry || hasGrant) && (hasGrant || !maxReached);
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
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${dark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-500'}`}>راسب</span>
                          )}
                          {/* [retake-grant] Tell the student they have a granted extra attempt. */}
                          {!isAbsent && hasGrant && (
                            <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                              🎁 منحة إعادة
                            </span>
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
                            {canRetry && (
                              <button
                                onClick={() => startRec(recInfo)}
                                disabled={!!startingId}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                  dark
                                    ? 'bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 border border-purple-700/40 disabled:opacity-40'
                                    : 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200 disabled:opacity-40'
                                }`}
                                title="إعادة التسميع"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>إعادة</span>
                              </button>
                            )}
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
                  <Section title="قادم قريباً ⏳" items={upcoming} dark={dark} cardCls={cardCls} onStart={null} navigate={navigate} onExpire={() => qc.invalidateQueries({ queryKey: ['student-recitations'] })} />
                )}
                {done.length > 0 && (
                  <Section title="أديته ✅" items={done} dark={dark} cardCls={cardCls} onStart={startRec} navigate={navigate} startingId={startingId} />
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

    const safeIdx = Math.min(currentQuestionIdx, questions.length - 1);
    const q = questions[safeIdx];
    const isFirst = safeIdx === 0;
    const isLast = safeIdx === questions.length - 1;
    const nextQ = !isLast ? questions[safeIdx + 1] : null;

    const isQAnswered = (qid) => {
      const a = answers[qid];
      if (a && typeof a === 'object') return Object.keys(a).length > 0;
      return !!a;
    };

    const goTo = (idx) => {
      setCurrentQuestionIdx(idx);
      const el = document.querySelector('main');
      if (el) el.scrollTop = 0;
      window.scrollTo(0, 0);
    };

    return (
      <>
      <div className={`min-h-screen ${dark ? 'bg-[var(--dk-bg)]' : 'bg-gray-50'}`} dir="rtl">
        {/* Sticky header: title + timer + submit */}
        <div className={`sticky top-0 z-20 border-b px-4 py-3 flex items-center justify-between gap-2 ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-200 shadow-sm'}`}>
          <div className="min-w-0 flex-1">
            <p className={`font-black text-sm truncate max-w-[200px] ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{selectedRec?.title}</p>
            <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{answered}/{questions.length} إجابة</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-lg tabular-nums ${
              urgent ? 'bg-red-100 text-red-600 animate-pulse' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)]' : 'bg-purple-50 text-purple-700'
            }`}>
              <Clock className="w-4 h-4" />
              {mins}:{String(secs).padStart(2, '0')}
            </div>
            <button
              onClick={() => {
                if (window.confirm(`هل أنت متأكد من تسليم التسميع؟\nأجبت على ${answered} من ${questions.length} أسئلة`)) {
                  handleSubmit(false);
                }
              }}
              disabled={submitting}
              className="bg-purple-500 hover:bg-purple-600 disabled:opacity-60 text-white text-xs sm:text-sm font-black px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap"
            >
              {submitting ? <RefreshCw className="w-4 h-4 inline animate-spin" /> : `تسليم (${answered}/${questions.length})`}
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* Question number grid */}
          <div className="flex flex-wrap gap-1.5 justify-center pt-1">
            {questions.map((qq, idx) => {
              const isAnswered = isQAnswered(qq.id);
              const isCurrent = idx === safeIdx;
              return (
                <button
                  key={qq.id}
                  onClick={() => goTo(idx)}
                  className={`w-9 h-9 rounded-xl text-sm font-black transition-all border-2 ${
                    isCurrent
                      ? 'bg-purple-500 text-white border-purple-500 shadow-md scale-110'
                      : isAnswered
                      ? (dark ? 'bg-purple-900/30 text-purple-300 border-purple-600' : 'bg-purple-50 text-purple-700 border-purple-400')
                      : (dark ? 'bg-[var(--dk-surface)] text-[var(--dk-text-2)] border-[var(--dk-border)]' : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300')
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Current question only */}
          {q && (
            <div>
              {/* ── Question separator ── */}
              <div className="flex items-center gap-3 mb-2 mt-1">
                <div className={`flex-1 h-px ${dark ? 'bg-purple-900/30' : 'bg-purple-100'}`} />
                <span className={`flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full whitespace-nowrap select-none border ${dark ? 'text-purple-400 bg-purple-900/20 border-purple-700/40' : 'text-purple-500 bg-purple-50 border-purple-200'}`}>
                  السؤال {safeIdx + 1} من {questions.length}
                  <span className={`font-normal ${dark ? 'text-purple-600' : 'text-purple-300'}`}>·</span>
                  <span className={`font-medium ${dark ? 'text-purple-500' : 'text-purple-400'}`}>
                    {q.question_type === 'true_false' ? 'صح / خطأ' : q.question_type === 'image_multi' ? 'صورة + أسئلة' : 'اختيار من متعدد'}
                  </span>
                </span>
                <div className={`flex-1 h-px ${dark ? 'bg-purple-900/30' : 'bg-purple-100'}`} />
              </div>
              <QuestionCard q={q} idx={safeIdx} answers={answers} setAnswers={setAnswers} dark={dark} onImagePress={setLightboxSrc} />
            </div>
          )}

          {/* Prefetch next question's images silently */}
          {nextQ?.question_image_url && (
            <img key={`prefetch-${nextQ.id}`} src={withToken(nextQ.question_image_url)} alt="" aria-hidden="true" className="hidden" />
          )}

          {/* Prev / Next navigation */}
          <div className="flex gap-2 pb-6">
            <button
              onClick={() => goTo(safeIdx - 1)}
              disabled={isFirst}
              className={`flex items-center gap-1 px-4 py-3 rounded-2xl font-black text-sm transition-colors disabled:opacity-40 ${
                dark ? 'bg-[var(--dk-surface)] text-[var(--dk-text)] border border-[var(--dk-border)]' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
              السابق
            </button>
            {isLast ? (
              <button
                onClick={() => {
                  if (window.confirm(`هل أنت متأكد من تسليم التسميع؟\nأجبت على ${answered} من ${questions.length} أسئلة`)) {
                    handleSubmit(false);
                  }
                }}
                disabled={submitting}
                className="flex-1 py-3 rounded-2xl font-black text-sm text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-60 transition-colors shadow-lg"
              >
                {submitting ? <><RefreshCw className="w-4 h-4 inline ml-1 animate-spin" />جاري التسليم...</> : `تسليم (${answered}/${questions.length})`}
              </button>
            ) : (
              <button
                onClick={() => goTo(safeIdx + 1)}
                className="flex-1 flex items-center justify-center gap-1 py-3 rounded-2xl font-black text-sm text-white bg-purple-500 hover:bg-purple-600 transition-colors shadow-lg"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>
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
            {!passed && selectedRec && (() => {
              const attempts = parseInt(selectedRec.my_attempt_count, 10) || 1;
              const maxAttempts = selectedRec.max_retry_attempts ? parseInt(selectedRec.max_retry_attempts, 10) : null;
              const maxReached = maxAttempts && attempts >= maxAttempts;
              const allowRetry = Boolean(selectedRec.allow_retry);
              // [retake-grant] An unused teacher-granted retake overrides both
              // allow_retry=false and max_retry_attempts (the server's /take
              // endpoint enforces the same).
              const unusedGrants = parseInt(selectedRec.unused_grants, 10) || 0;
              const hasGrant = unusedGrants > 0;
              if (!(allowRetry || hasGrant)) return null;
              if (maxReached && !hasGrant) return null;
              return (
                <button
                  onClick={() => {
                    setView('list');
                    setResult(null);
                    setSubmitting(false);
                    submittedRef.current = false;
                    startRec(selectedRec);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm text-white transition-colors shadow-lg ${
                    hasGrant
                      ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                      : 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  {hasGrant ? 'محاولة إضافية من المعلم 🎁' : `أعد المحاولة ${maxAttempts ? `(${attempts + 1}/${maxAttempts})` : ''}`}
                </button>
              );
            })()}
            <button onClick={() => {
              setView('list');
              setResult(null);
              setSubmitting(false);
              submittedRef.current = false;
              qc.invalidateQueries({ queryKey: ['student-recitations'] });
              qc.invalidateQueries({ queryKey: ['student-recitation-results'] });
            }}
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

function Section({ title, items, dark, cardCls, onStart, navigate, startingId = null, onExpire = null }) {
  return (
    <div>
      <h2 className={`font-black mb-3 text-base sm:text-lg flex items-center gap-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
        <span>{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>
          {items.length}
        </span>
      </h2>
      <div className="space-y-3">
        {items.map(rec => {
          const status = getStatus(rec);
          const isStarting = startingId === rec.id;
          return (
            <div
              key={rec.id}
              className={`${cardCls} flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all`}
            >
              {/* Header & Meta Section */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0 ${
                    status === 'open'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                      : status === 'done'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : status === 'upcoming'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                  }`}
                >
                  <BookOpen className="w-5 h-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-bold text-sm sm:text-base leading-snug ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                      {rec.title}
                    </p>
                    {/* Status badge/icon on mobile top-left */}
                    <div className="sm:hidden flex-shrink-0">
                      {status === 'done' && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        </div>
                      )}
                      {status === 'expired' && <XCircle className="w-4 h-4 text-red-400" />}
                      {status === 'upcoming' && <Lock className={`w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />}
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 mt-2 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'} flex-wrap`}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5 inline" />
                      {rec.duration_minutes} دقيقة
                    </span>
                    <span>•</span>
                    <span className="whitespace-nowrap">{rec.question_count} سؤال</span>
                    {rec.academic_stage && (
                      <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                        dark
                          ? 'bg-purple-900/30 text-purple-300 border border-purple-800/40'
                          : 'bg-purple-50 text-purple-700 border border-purple-100'
                      }`}>
                        {rec.academic_stage}
                      </span>
                    )}
                    {status === 'upcoming' && rec.start_date && (
                      <CountdownBadge target={rec.start_date} onExpire={onExpire} />
                    )}
                    {status === 'done' && (
                      <span className={`font-black text-xs px-2 py-0.5 rounded-md ${
                        (rec.my_ever_passed ?? (rec.my_passed === true || rec.my_passed === 'true'))
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'
                      }`}>
                        الدرجة: {rec.my_score}/{rec.total_score}
                      </span>
                    )}
                    {status === 'expired' && (
                      <span className="text-red-500 font-bold text-[11px] bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-md">
                        انتهى الوقت
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Section */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800/60 sm:flex-shrink-0">
                {status === 'open' && onStart && (() => {
                  const isRecSessionInProgress = (() => {
                    try {
                      return !!localStorage.getItem(`recitation_answers_${rec.id}`);
                    } catch (_) { return false; }
                  })();
                  return (
                    <button
                      onClick={() => onStart(rec)}
                      disabled={!!startingId}
                      className={`w-full sm:w-auto px-5 py-2.5 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                        isRecSessionInProgress
                          ? 'bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 shadow-purple-500/20'
                          : 'bg-purple-500 hover:bg-purple-600'
                      }`}
                    >
                      {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isRecSessionInProgress ? <RotateCcw className="w-3.5 h-3.5" /> : null}
                      {isStarting ? 'جاري التحميل...' : isRecSessionInProgress ? 'استئناف التسميع' : 'ابدأ التسميع'}
                    </button>
                  );
                })()}

                {status === 'upcoming' && (
                  <div className="hidden sm:flex items-center gap-1 text-xs font-semibold text-gray-400">
                    <Lock className="w-4 h-4" />
                    <span>مغلق حالياً</span>
                  </div>
                )}

                {status === 'done' && (
                  <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
                    {rec.result_id && navigate && (
                      <button
                        onClick={() => navigate(`/student/recitation-review/${rec.result_id}`)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                          dark
                            ? 'bg-indigo-900/30 text-indigo-300 hover:bg-indigo-900/50 border border-indigo-700/30'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        مراجعة
                      </button>
                    )}

                    {/* Show retry button only for FAILED students when allow_retry=true and limit not reached.
                        [retake-grant] An unused teacher-granted retake overrides both allow_retry=false
                        and max_retry_attempts (the server's /take endpoint enforces the same). */}
                    {(() => {
                      const isPassed = rec.my_ever_passed ?? (rec.my_passed === true || rec.my_passed === 'true');
                      const attempts = parseInt(rec.my_attempt_count, 10) || 1;
                      const maxAttempts = rec.max_retry_attempts ? parseInt(rec.max_retry_attempts, 10) : null;
                      const maxReached = maxAttempts && attempts >= maxAttempts;
                      const allowRetry = Boolean(rec.allow_retry);
                      const unusedGrants = parseInt(rec.unused_grants, 10) || 0;
                      const hasGrant = unusedGrants > 0;
                      if (!isPassed && (allowRetry || hasGrant) && (hasGrant || !maxReached) && onStart) {
                        return (
                          <button
                            onClick={() => onStart(rec)}
                            disabled={!!startingId}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              hasGrant
                                ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border border-emerald-500/40'
                                : dark
                                  ? 'bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 border border-purple-700/30'
                                  : 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-100'
                            }`}
                            title={hasGrant ? 'لديك محاولة إضافية من المعلم' : undefined}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {hasGrant ? 'محاولة إضافية من المعلم 🎁' : `إعادة المحاولة ${maxAttempts ? `(${attempts}/${maxAttempts})` : ''}`}
                          </button>
                        );
                      }
                      if (!isPassed && (allowRetry || hasGrant) && maxReached && !hasGrant) {
                        return (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg ${
                              dark
                                ? 'bg-red-900/20 text-red-400 border border-red-800/30'
                                : 'bg-red-50 text-red-600 border border-red-100'
                            }`}
                          >
                            استنفدت المحاولات ({maxAttempts})
                          </span>
                        );
                      }
                      return null;
                    })()}

                    <div className="hidden sm:block">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                  </div>
                )}

                {status === 'expired' && (
                  <div className="hidden sm:block">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionCard({ q, idx, answers, setAnswers, dark, onImagePress }) {
  const defaultArabic = ['أ', 'ب', 'ج', 'د'];
  const rawLabels = Array.isArray(q.option_labels) && q.option_labels.length > 0 ? q.option_labels : defaultArabic;
  const options = [
    q.option_a && { letter: 'A', text: q.option_a, displayLabel: rawLabels[0] || defaultArabic[0] || 'أ' },
    q.option_b && { letter: 'B', text: q.option_b, displayLabel: rawLabels[1] || defaultArabic[1] || 'ب' },
    q.option_c && { letter: 'C', text: q.option_c, displayLabel: rawLabels[2] || defaultArabic[2] || 'ج' },
    q.option_d && { letter: 'D', text: q.option_d, displayLabel: rawLabels[3] || defaultArabic[3] || 'د' },
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
        <QuestionImage
          src={q.question_image_url}
          alt="سؤال"
          maxHeightClass="max-h-64 sm:max-h-80"
          onImagePress={onImagePress}
          dark={dark}
        />
      )}

      {isImgMulti ? (
        <div className="space-y-2">
          {/* Shared options — hide when options are just the letters themselves (auto-generated) */}
          {options.some(o => o.text !== o.letter) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {options.map(({ letter, text, displayLabel }) => (
                <span key={letter} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                  {displayLabel}: {text}
                </span>
              ))}
            </div>
          )}
          {/* Sub-questions */}
          {(q.sub_questions || []).map(sub => {
            const subSel = subAnswers[sub.label];
            const isTF = sub.type === 'true_false';
            // Build sub-options from sub.option_labels (image_multi MCQ sub-questions do not
            // use the parent question's option_a/b/c/d — those are null for image_multi).
            // Limit to actual option count to avoid phantom buttons.
            const subOptions = isTF
              ? [{ letter: 'A', label: 'صح' }, { letter: 'B', label: 'خطأ' }]
              : ['A', 'B', 'C', 'D'].slice(0, sub.option_labels?.length || 4)
                  .map((letter, i) => ({ letter, label: sub.option_labels?.[i] || defaultArabic[i] || letter }));
            return (
              <div key={sub.label} className={`rounded-xl p-3 border ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-sm font-bold mb-2 flex items-center justify-between ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  <span>البند {sub.label}</span>
                  <span className={`text-xs font-normal ${dark ? 'text-[var(--dk-text-3)]' : 'text-gray-500'}`}>({sub.points || 1} درجة)</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {subOptions.map((opt) => {
                    const isSel = subSel === opt.letter;
                    return (
                      <button key={opt.letter}
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [sub.label]: opt.letter } }))}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                          isSel
                            ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                            : dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text)] hover:border-purple-400' : 'bg-white border-gray-300 text-gray-700 hover:border-purple-300'
                        }`}>
                        {opt.label}
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
          {options.map(({ letter, text, displayLabel }) => {
            const isSelected = selected === letter;
            return (
              <button key={letter} onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                className={`w-full text-right flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                  isSelected
                    ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                    : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] hover:border-purple-400' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-white text-purple-600'}`}>{displayLabel}</span>
                {text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
