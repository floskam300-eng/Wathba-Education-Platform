import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Play, Eye, Calendar, Lock, RotateCcw, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import ImageLightbox from '../../components/ImageLightbox';
import { toUTCDate, getServerNow, getServerNowMs, formatEgyptDateTime } from '../../lib/dateUtils';
import Modal from '../../components/ui/Modal';
import MathText from '../../components/MathText';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

import { withToken } from '../../lib/mediaAccess';
import QuestionImage from '../../components/ui/QuestionImage';

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getShuffledOpts(q, studentId, shuffleOptions) {
  if (Array.isArray(q?.shuffled_options) && q.shuffled_options.length > 0) {
    return q.shuffled_options;
  }
  const allOpts = ['A', 'B', 'C', 'D'].filter(o => q[`option_${o.toLowerCase()}`]);
  if (!shuffleOptions) return allOpts;
  const sId = parseInt(studentId, 10) || 1;
  const qId = parseInt(q.id, 10) || 1;
  const seed = ((sId * 1000003) ^ (qId * 999983)) >>> 0;
  return seededShuffle(allOpts, seed || 1);
}

const getExamScheduleStatus = (ex, now = getServerNow()) => {
  if (ex.start_date && toUTCDate(ex.start_date) > now) return 'upcoming';
  if (ex.end_date && toUTCDate(ex.end_date) < now) return 'expired';
  return 'open';
};

// Isolated countdown badge — manages its own 1s timer to avoid re-rendering the whole page
const ExamCountdownBadge = React.memo(function ExamCountdownBadge({ targetDate, onExpire }) {
  const targetMs = toUTCDate(targetDate)?.getTime() ?? Infinity;
  const [display, setDisplay] = useState(() => formatCountdown(targetMs - getServerNowMs()));
  const expiredRef = useRef(false);
  useEffect(() => {
    expiredRef.current = false;
    const update = () => {
      const msLeft = targetMs - getServerNowMs();
      if (msLeft <= 0) {
        setDisplay(null);
        if (!expiredRef.current) {
          expiredRef.current = true;
          if (onExpire) onExpire();
        }
      } else {
        setDisplay(formatCountdown(msLeft));
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  if (!display) return null;
  return (
    <span className="text-xs font-black text-orange-700 bg-orange-100 rounded-lg px-2 py-0.5 tabular-nums tracking-wider">
      ⏳ {display}
    </span>
  );
});

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalSecs = Math.floor(ms / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;
  if (days > 0) return `${days} يوم ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

export default function StudentExams() {
  const { user } = useAuth();
  const studentId = user?.id || 0;
  const qc = useQueryClient();
  const [taking, setTaking] = useState(null);
  const [examData, setExamData] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [pendingExam, setPendingExam] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [retryModal, setRetryModal] = useState(null);
  const [retryMessage, setRetryMessage] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Used only at start/end boundaries so the card status changes without a
  // manual refresh or a one-second re-render of the whole page.
  const [scheduleNow, setScheduleNow] = useState(() => getServerNow());
  // Collapsed by default — student taps the button to expand and review past attempts
  const [showHistory, setShowHistory] = useState(false);
  // Question-by-question navigation
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);

  // Storage key helpers scoped to user.id
  const getAnsKey = useCallback((id) => `exam_answers_${user?.id || 0}_${id}`, [user?.id]);
  const getStartKey = useCallback((id) => `exam_start_${user?.id || 0}_${id}`, [user?.id]);
  const getActKey = useCallback((id) => `exam_active_${user?.id || 0}_${id}`, [user?.id]);

  const clearExamKeys = useCallback((id) => {
    if (!id) return;
    try {
      const uId = user?.id || 0;
      localStorage.removeItem(`exam_answers_${uId}_${id}`);
      localStorage.removeItem(`exam_start_${uId}_${id}`);
      localStorage.removeItem(`exam_active_${uId}_${id}`);
      localStorage.removeItem(`exam_answers_${id}`);
      localStorage.removeItem(`exam_start_${id}`);
      localStorage.removeItem(`exam_active_${id}`);
    } catch (_) {}
  }, [user?.id]);

  // Ref attached to the root scrollable div in every view (exam-taking, list, result).
  // scrollAllToTop resets both this container AND the layout <main> so we cover all cases.
  const scrollContainerRef = useRef(null);

  const answersRef = useRef({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Guard against double-submission from timer + manual submit racing
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);

  const { data: myResults = [] } = useQuery({
    queryKey: ['student-my-results'],
    queryFn: () => api.get('/exams/student/my-results').then(r => r.data),
    // Exam history changes after every submission or teacher reset. Do not let
    // the persisted global query cache hide those changes after a refresh.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['student-exams'],
    queryFn: () => api.get('/exams/student/available').then(r => r.data),
    // SSE is the fast path. Polling is the recovery path when a device was
    // offline or its long-lived SSE connection was interrupted.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  // Mounted ref + submittedRef reset on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submittedRef.current = false;
    };
  }, []);

  const refreshScheduleState = useCallback(() => {
    setScheduleNow(getServerNow());
    qc.invalidateQueries({ queryKey: ['student-exams'] });
  }, [qc]);

  // Refresh exactly when an exam opens or expires. The API refresh remains a
  // fallback, but the local status must change even if the request is slow.
  useEffect(() => {
    if (!exams.length) return;
    const currentServerMs = getServerNowMs();
    const boundaryDates = exams
      .flatMap(ex => [ex.start_date, ex.end_date])
      .map(date => toUTCDate(date)?.getTime() ?? 0)
      .filter(ts => ts > currentServerMs);

    const timers = boundaryDates.map(ts => {
      const delay = ts - getServerNowMs();
      if (delay <= 0) return null;
      return setTimeout(() => {
        refreshScheduleState();
      }, delay + 500);
    }).filter(Boolean);

    return () => timers.forEach(t => clearTimeout(t));
  }, [exams, refreshScheduleState]);

  // Listen for SSE exam_started event to also force-refresh
  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['student-exams'] });
    };
    window.addEventListener('wathba_exam_started', handler);
    return () => window.removeEventListener('wathba_exam_started', handler);
  }, [qc]);

  const { data: retryRequests = [] } = useQuery({
    queryKey: ['student-retry-requests'],
    queryFn: () => api.get('/exams/student/retry-requests').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // T7 FIX: backend returns requests ORDER BY created_at DESC (newest first).
  // The old last-wins reduce overwrote the newest entry with progressively older
  // ones — so the OLDEST request won. Use first-wins so the newest request is kept.
  const retryMap = retryRequests.reduce((acc, r) => {
    if (!acc[r.exam_id]) acc[r.exam_id] = r;
    return acc;
  }, {});

  const retryRequestMut = useMutation({
    mutationFn: ({ examId, message }) => api.post(`/exams/${examId}/retry-request`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-retry-requests'] });
      toast.success('تم إرسال طلب إعادة الاختبار للمعلم');
      setRetryModal(null);
      setRetryMessage('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const submitMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/exams/${id}/submit`, data),
    onSuccess: (res, variables) => {
      clearExamKeys(variables.id);
      setResult(res.data);
      setTaking(null);
      setExamData(null);
      qc.invalidateQueries({ queryKey: ['student-exams'] });
      qc.invalidateQueries({ queryKey: ['student-my-results'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
    },
    onError: (e, variables) => {
      const status = e.response?.status;
      if (status === 409 || e.response?.data?.already_submitted) {
        // Already submitted (e.g., duplicate keepalive) — clean up and refresh
        clearExamKeys(variables.id);
        setTaking(null);
        setExamData(null);
        qc.invalidateQueries({ queryKey: ['student-exams'] });
        qc.invalidateQueries({ queryKey: ['student-my-results'] });
      } else {
        // Retriable error — reset guard so student can re-submit
        submittedRef.current = false;
      }
      toast.error(e.response?.data?.error || 'حدث خطأ في الإرسال');
    },
  });

  // Pre-compute shuffled MCQ options once when exam data loads (not on every re-render)
  const shuffledQuestionsOpts = useMemo(() => {
    if (!examData) return {};
    const map = {};
    for (const q of (examData.questions || [])) {
      map[q.id] = getShuffledOpts(q, studentId, examData.exam.shuffle_options);
    }
    return map;
  }, [examData, studentId]);

  const takingRef = useRef(null);
  const examDataRef = useRef(null);
  const startTimeRef = useRef(null);
  useEffect(() => { takingRef.current = taking; }, [taking]);
  useEffect(() => { examDataRef.current = examData; }, [examData]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);

  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Shared scroll-to-top helper used on exam entry and result display.
  // Single immediate reset of the component's own scrollable div (and the
  // layout <main> as a fallback). Deliberately NOT repeated on a timer — the
  // old version re-scrolled to top 5 times over 600ms, which hijacked the
  // student's touch scrolling on mobile and made the page appear to freeze
  // and jump up by itself after every question change.
  const scrollAllToTop = useCallback(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Scroll to top when result is shown (exam finished).
  useEffect(() => {
    if (result) return scrollAllToTop();
  }, [!!result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top when entering an exam (taking becomes non-null).
  useEffect(() => {
    if (taking) return scrollAllToTop();
  }, [!!taking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top again when exam questions finish loading.
  useEffect(() => {
    if (examData) return scrollAllToTop();
  }, [!!examData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset question index whenever a new exam is loaded
  useEffect(() => {
    if (examData) setCurrentQuestionIdx(0);
  }, [examData]);

  // Track stuck exams across storage
  const stuckExamIds = React.useMemo(() => {
    if (taking) return [];
    try {
      const uId = user?.id || 0;
      const actPrefix = `exam_active_${uId}_`;
      const ansPrefix = `exam_answers_${uId}_`;
      const startPrefix = `exam_start_${uId}_`;
      const ids = new Set();
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(actPrefix)) {
          const id = parseInt(k.replace(actPrefix, ''), 10);
          if (!isNaN(id)) ids.add(id);
        } else if (k.startsWith(ansPrefix)) {
          const id = parseInt(k.replace(ansPrefix, ''), 10);
          if (!isNaN(id)) ids.add(id);
        } else if (k.startsWith(startPrefix)) {
          const id = parseInt(k.replace(startPrefix, ''), 10);
          if (!isNaN(id)) ids.add(id);
        } else if (k.startsWith('exam_start_')) {
          const id = parseInt(k.replace('exam_start_', ''), 10);
          if (!isNaN(id)) ids.add(id);
        }
      });
      return Array.from(ids);
    } catch (_) { return []; }
  }, [taking, exams, user?.id]);

  // Active in-progress exam session detection
  const activeInProgressExam = useMemo(() => {
    if (taking) return null;
    const uId = user?.id || 0;
    return exams.find(ex => {
      const scheduleStatus = getExamScheduleStatus(ex, scheduleNow);
      if (scheduleStatus !== 'open' || ex.already_taken) return false;
      try {
        return !!(
          localStorage.getItem(`exam_answers_${uId}_${ex.id}`) ||
          localStorage.getItem(`exam_active_${uId}_${ex.id}`) ||
          localStorage.getItem(`exam_start_${uId}_${ex.id}`) ||
          localStorage.getItem(`exam_answers_${ex.id}`) ||
          localStorage.getItem(`exam_start_${ex.id}`)
        );
      } catch (_) { return false; }
    }) || null;
  }, [exams, taking, scheduleNow, user?.id]);

  const clearStuckSession = (examId) => {
    clearExamKeys(examId);
    window.location.reload();
  };

  const handleSubmit = useCallback(() => {
    if (!taking || !examData || submittedRef.current) return;
    submittedRef.current = true;
    // locked: true = student manually submitted (قفّل الامتحان بنفسه) → earns lock bonus
    submitMut.mutate({ id: taking.id, data: { answers: answersRef.current, start_time: startTime, locked: true } });
  }, [taking, examData, startTime]);

  const syncTimeoutRef = useRef(null);

  const syncAnswersToServer = useCallback((examId, currentAnswers) => {
    if (!examId) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      api.post(`/exams/${examId}/sync-answers`, { answers: currentAnswers }).catch(() => {});
    }, 400);
  }, []);

  const flushAnswersNow = useCallback((examId, currentAnswers) => {
    if (!examId || !currentAnswers) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    api.post(`/exams/${examId}/sync-answers`, { answers: currentAnswers }).catch(() => {});
  }, []);

  // Flush answers immediately when tab is closed or hidden
  useEffect(() => {
    if (!taking) return;
    const handleFlush = () => {
      if (takingRef.current?.id && answersRef.current) {
        flushAnswersNow(takingRef.current.id, answersRef.current);
      }
    };
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    };
    window.addEventListener('beforeunload', handleFlush);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('beforeunload', handleFlush);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [taking, flushAnswersNow]);

  // ── Save answers to localStorage & sync to server whenever they change ──
  useEffect(() => {
    if (!taking) return;
    try {
      const uId = user?.id || 0;
      localStorage.setItem(`exam_answers_${uId}_${taking.id}`, JSON.stringify(answers));
      localStorage.setItem(`exam_active_${uId}_${taking.id}`, 'true');
    } catch (_) {}

    syncAnswersToServer(taking.id, answers);
  }, [answers, taking, user?.id, syncAnswersToServer]);

  // ── Monotonic Timer + Resume Handling ──
  const timerEpochRef = useRef(null);
  const timerDurationRef = useRef(null);

  useEffect(() => {
    if (!examData || !taking) return;
    const examId = taking.id;
    const durationSecs = Math.max(1, parseInt(examData.exam?.duration_minutes, 10) || 60) * 60;

    let remainingSecs = durationSecs;
    if (typeof examData.remaining_seconds === 'number' && !isNaN(examData.remaining_seconds)) {
      remainingSecs = Math.max(0, examData.remaining_seconds);
    } else if (examData.server_started_at || examData.serverStartedAt) {
      const startedAtStr = examData.server_started_at || examData.serverStartedAt;
      const serverNowMs = examData.server_now ? new Date(examData.server_now).getTime() : getServerNowMs();
      const startedAtMs = new Date(startedAtStr).getTime();
      if (!isNaN(startedAtMs)) {
        const elapsedSecs = Math.max(0, Math.floor((serverNowMs - startedAtMs) / 1000));
        remainingSecs = Math.max(0, durationSecs - elapsedSecs);
      }
      if (examData.exam?.end_date) {
        const endMs = toUTCDate(examData.exam.end_date)?.getTime();
        if (endMs && !isNaN(endMs)) {
          const timeUntilEndSec = Math.max(0, Math.floor((endMs - serverNowMs) / 1000));
          remainingSecs = Math.min(remainingSecs, timeUntilEndSec);
        }
      }
    }

    const startIso = examData.server_started_at || examData.serverStartedAt || new Date().toISOString();
    setStartTime(startIso);

    const baseClientMs = getServerNowMs();
    const baseRemainingSecs = remainingSecs;
    timerEpochRef.current = performance.now();
    timerDurationRef.current = remainingSecs;
    setTimeLeft(remainingSecs);

    if (remainingSecs <= 0) {
      clearExamKeys(examId);
      if (!submittedRef.current) {
        submittedRef.current = true;
        submitMut.mutate({ id: examId, data: { answers: answersRef.current, start_time: startIso, locked: false } });
      }
      return;
    }

    const calculateRemaining = () => {
      if (timerEpochRef.current === null || timerDurationRef.current === null) return 0;
      const perfElapsed = Math.floor((performance.now() - timerEpochRef.current) / 1000);
      const wallElapsed = Math.floor((getServerNowMs() - baseClientMs) / 1000);
      const effectiveElapsed = Math.max(perfElapsed, wallElapsed);
      return Math.max(0, baseRemainingSecs - effectiveElapsed);
    };

    let timerActive = true;
    const checkAndTick = () => {
      const trueLeft = calculateRemaining();
      setTimeLeft(trueLeft);
      if (trueLeft <= 0) {
        clearInterval(interval);
        clearExamKeys(examId);
        if (timerActive && !submittedRef.current) {
          submittedRef.current = true;
          submitMut.mutate({ id: examId, data: { answers: answersRef.current, start_time: startIso, locked: false } });
        }
      }
    };

    const interval = setInterval(checkAndTick, 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' || (typeof document.hasFocus === 'function' && document.hasFocus())) {
        checkAndTick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      timerActive = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [examData, taking, clearExamKeys]);

  /* ── Pre-exam countdown 3-2-1 ── */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setTaking(pendingExam);
      setPendingExam(null);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, pendingExam]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const navigate = useNavigate();

  const openExam = async (exam) => {
    const status = getExamScheduleStatus(exam, getServerNow());
    if (status === 'upcoming') return toast.error('الاختبار لم يبدأ بعد');
    if (status === 'expired' && retryMap[exam.id]?.status !== 'approved') {
      clearExamKeys(exam.id);
      return toast.error('انتهى وقت هذا الاختبار');
    }

    setStartingId(exam.id);
    try {
      const res = await api.get(`/exams/${exam.id}/take`);
      const data = res.data;

      // Check if remaining seconds is expired
      if (typeof data.remaining_seconds === 'number' && data.remaining_seconds <= 0) {
        clearExamKeys(exam.id);
        toast.error('لقد انتهت مهلة محاولتك لهذا الاختبار');
        qc.invalidateQueries({ queryKey: ['student-exams'] });
        qc.invalidateQueries({ queryKey: ['student-my-results'] });
        setStartingId(null);
        return;
      }

      // If starting a fresh (non-resumed) session, clear stale localStorage answers
      // to prevent old attempts or shared-device data from leaking into the new session
      if (!data.resumed) {
        clearExamKeys(exam.id);
      }

      // Restore saved answers from server session and localStorage
      let loadedAnswers = {};
      if (data.resumed) {
        try {
          const uId = user?.id || 0;
          const saved = localStorage.getItem(`exam_answers_${uId}_${exam.id}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              loadedAnswers = parsed;
            }
          }
        } catch (_) {}
      }

      const serverSaved = (data.saved_answers && typeof data.saved_answers === 'object' && !Array.isArray(data.saved_answers))
        ? data.saved_answers
        : {};
      const mergedAnswers = { ...serverSaved, ...loadedAnswers };

      // Freeze shuffled options immutably on each question object upon opening the exam
      const effectiveStudentId = user?.id || data.exam?.student_id || studentId || 1;
      const frozenQuestions = (data.questions || []).map(q => ({
        ...q,
        _displayOpts: getShuffledOpts(q, effectiveStudentId, data.exam?.shuffle_options),
      }));

      const frozenData = {
        ...data,
        questions: frozenQuestions,
      };

      setAnswers(mergedAnswers);
      setResult(null);
      submittedRef.current = false;
      setCurrentQuestionIdx(0);
      setExamData(frozenData);

      // Set active indicator in localStorage immediately
      try {
        const uId = user?.id || 0;
        localStorage.setItem(`exam_active_${uId}_${exam.id}`, 'true');
      } catch (_) {}

      const examForTaking = { ...exam };
      if (retryMap[exam.id]?.status === 'approved') {
        delete examForTaking.already_taken;
      }

      if (data.resumed || Object.keys(mergedAnswers).length > 0) {
        // Resume directly without 3-2-1 countdown screen
        setTaking(examForTaking);
        setStartingId(null);
      } else {
        setPendingExam(examForTaking);
        setCountdown(3);
        setStartingId(null);
      }
    } catch (err) {
      const isExpiredOrSubmitted =
        err.response?.status === 403 &&
        (err.response?.data?.timer_expired || err.response?.data?.already_submitted);

      if (isExpiredOrSubmitted) {
        clearExamKeys(exam.id);
        qc.invalidateQueries({ queryKey: ['student-exams'] });
        qc.invalidateQueries({ queryKey: ['student-my-results'] });
      }
      setStartingId(null);
      const errMsg = err.response?.data?.error || 'تعذر فتح الاختبار';
      toast.error(errMsg);
    }
  };

  /* ── Pre-exam countdown overlay ── */
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/95 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-white/60 text-lg font-bold mb-6">الاختبار سيبدأ بعد</p>
          {countdown > 0 ? (
            <div
              key={countdown}
              className="w-40 h-40 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/40"
              style={{ animation: 'countPop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
            >
              <span className="text-7xl font-black text-white">{countdown}</span>
            </div>
          ) : (
            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto shadow-2xl shadow-green-500/40">
              <span className="text-4xl font-black text-white">ابدأ!</span>
            </div>
          )}
          <p className="text-white/40 text-sm font-medium mt-6">{pendingExam?.title}</p>
        </div>
        <style>{`
          @keyframes countPop {
            from { transform: scale(0.5); opacity: 0.3; }
            to   { transform: scale(1);   opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (taking && !examData && !taking.already_taken) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 dark:text-[var(--dk-text-2)] font-bold">جاري تحميل الاختبار...</p>
        </div>
      </div>
    );
  }

  if (taking && examData && !taking.already_taken) {
    const { exam, questions } = examData;
    const answered = Object.keys(answers).filter(k => {
      const a = answers[k];
      if (a && typeof a === 'object') return Object.keys(a).length > 0;
      return !!a;
    }).length;

    const safeIdx = Math.min(currentQuestionIdx, questions.length - 1);
    const q = questions[safeIdx];
    const qType = q?.question_type || 'mcq';
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
      // Only reset the exam's own scroll container so the new question starts
      // at the top — without touching the window/main (which is what made the
      // page jump up by itself on mobile).
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    };

    return (
      <>
      <div ref={scrollContainerRef} className="h-full overflow-y-auto p-3 sm:p-4 lg:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Exam header bar */}
          <div className="card bg-navy-600 text-white !p-3 sm:!p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-lg font-black text-white leading-snug line-clamp-2">{exam.title}</h2>
                <p className="text-navy-100 text-xs font-medium mt-0.5">{answered}/{questions.length} سؤال</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl ${timeLeft < 60 ? 'bg-red-500/30 text-red-200 animate-pulse' : 'bg-white/10 text-orange-300'}`}>
                  <Clock className="w-4 h-4" />
                  <span className="text-lg sm:text-2xl font-black tabular-nums">{formatTime(timeLeft)}</span>
                </div>
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={submitMut.isPending}
                  className="bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm font-black px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap"
                >
                  {submitMut.isPending ? '...' : `تسليم (${answered}/${questions.length})`}
                </button>
              </div>
            </div>
            {/* Progress bar inline */}
            <div className="w-full bg-white/20 rounded-full h-1.5 mt-3">
              <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${(answered / questions.length) * 100}%` }} />
            </div>
          </div>

          {/* Question number grid */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
            {questions.map((qq, idx) => {
              const isAnswered = isQAnswered(qq.id);
              const isCurrent = idx === safeIdx;
              return (
                <button
                  key={qq.id}
                  onClick={() => goTo(idx)}
                  className={`w-9 h-9 rounded-xl text-sm font-black transition-all border-2 ${
                    isCurrent
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md scale-110'
                      : isAnswered
                      ? 'bg-orange-50 text-orange-700 border-orange-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
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
                <div className="flex-1 h-px bg-orange-100 dark:bg-orange-900/30" />
                <span className="flex items-center gap-1.5 text-xs font-black text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/40 px-3 py-1 rounded-full whitespace-nowrap select-none">
                  السؤال {safeIdx + 1} من {questions.length}
                  <span className="text-orange-300 dark:text-orange-600 font-normal">·</span>
                  <span className="font-medium text-orange-400 dark:text-orange-500">
                    {qType === 'true_false' ? 'صح / خطأ' : qType === 'image_multi' ? 'صورة + أسئلة' : 'اختيار من متعدد'}
                  </span>
                </span>
                <div className="flex-1 h-px bg-orange-100 dark:bg-orange-900/30" />
              </div>
              <div className={`card !p-3 sm:!p-5 ${answers[q.id] ? 'border-2 border-orange-400' : 'border border-gray-200'}`}>
                {/* Question label row */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-navy-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{safeIdx + 1}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${qType === 'true_false' ? 'bg-purple-100 text-purple-700' : qType === 'image_multi' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                    {qType === 'true_false' ? 'صح/خطأ' : qType === 'image_multi' ? 'صورة+أسئلة' : 'اختيار'}
                  </span>
                  {answers[q.id] && <span className="text-xs text-green-600 font-bold mr-auto">✓ أُجيب</span>}
                </div>

                {q.question_text && (
                  <p className="font-semibold text-navy-700 mb-3 text-sm sm:text-base leading-relaxed"><MathText text={q.question_text} /></p>
                )}

                {q.question_image_url && (
                  <QuestionImage
                    src={q.question_image_url}
                    alt="سؤال"
                    maxHeightClass="max-h-56 sm:max-h-72"
                    onImagePress={(url) => setLightboxSrc(url)}
                  />
                )}

                {qType === 'true_false' ? (
                  <div className="flex gap-3">
                    {[{ opt: 'A', label: '✅ صح' }, { opt: 'B', label: '❌ خطأ' }].map(({ opt, label }) => (
                      <button key={opt} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${answers[q.id] === opt ? 'border-orange-500 bg-orange-50 text-orange-850' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : qType === 'image_multi' ? (
                  <div className="space-y-1.5">
                    {(q.sub_questions || []).map(sub => {
                      let subAnswers = {};
                      try { const raw = answers[q.id]; subAnswers = raw && typeof raw === 'object' ? raw : JSON.parse(raw || '{}'); } catch {}
                      const subSel = subAnswers[sub.label];
                      return (
                        <div key={sub.label} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                          <span className="text-xs font-black text-navy-600 w-24 flex-shrink-0">
                            {sub.label} <span className="text-[10px] text-gray-400 font-normal">({sub.points || 1} د)</span>
                          </span>
                          <div className="flex gap-1 flex-1">
                            {(sub.type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D'].slice(0, sub.option_labels?.length || 4)).map(letter => (
                              <button key={letter} type="button"
                                onClick={() => {
                                  setAnswers(prev => {
                                    let current = {};
                                    try { const raw = prev[q.id]; current = raw && typeof raw === 'object' ? raw : JSON.parse(raw || '{}'); } catch {}
                                    return { ...prev, [q.id]: { ...current, [sub.label]: letter } };
                                  });
                                }}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                                  subSel === letter ? 'border-orange-500 bg-orange-50 text-orange-850' : 'border-gray-200 hover:border-gray-400 text-gray-655'
                                }`}>
                                {sub.type === 'true_false' ? (letter === 'A' ? 'صح' : 'خطأ') : (sub.option_labels?.[['A', 'B', 'C', 'D'].indexOf(letter)] || ['أ', 'ب', 'ج', 'د'][['A', 'B', 'C', 'D'].indexOf(letter)] || letter)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {(() => {
                       const shuffledOpts = q.shuffled_options || q._displayOpts || shuffledQuestionsOpts[q.id] || getShuffledOpts(q, studentId, exam.shuffle_options);
                       const defaultArabic = ['أ', 'ب', 'ج', 'د'];
                       const displayLabels = Array.isArray(q.option_labels) && q.option_labels.length > 0 ? q.option_labels : defaultArabic;
                       return shuffledOpts.map((origOpt, idx) => (
                        <button key={origOpt} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: origOpt }))}
                          className={`flex items-center gap-2 p-2.5 sm:p-3 rounded-xl text-sm font-semibold text-right transition-all border-2 ${answers[q.id] === origOpt ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 hover:border-navy-300 hover:bg-navy-50 text-navy-700'}`}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${answers[q.id] === origOpt ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{displayLabels[idx] || defaultArabic[idx] || origOpt}</span>
                          <span className="flex-1 leading-snug"><MathText text={q[`option_${origOpt.toLowerCase()}`]} /></span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prefetch next question's images silently */}
          {nextQ?.question_image_url && (
            <img key={`prefetch-${nextQ.id}`} src={withToken(nextQ.question_image_url)} alt="" aria-hidden="true" className="hidden" />
          )}

          {/* Prev / Next navigation */}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowCancelConfirm(true)} className="btn-secondary flex-none px-3 text-sm">خروج</button>
            <button
              onClick={() => goTo(safeIdx - 1)}
              disabled={isFirst}
              className="flex items-center gap-1 btn-secondary flex-none px-3 text-sm disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
              السابق
            </button>
            {isLast ? (
              <button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={submitMut.isPending}
                className="btn-primary flex-1 py-3 text-sm sm:text-base"
              >
                {submitMut.isPending ? 'جاري الإرسال...' : `تسليم (${answered}/${questions.length})`}
              </button>
            ) : (
              <button
                onClick={() => goTo(safeIdx + 1)}
                className="flex items-center gap-1 btn-primary flex-1 py-3 text-sm sm:text-base justify-center"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {showCancelConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8 text-yellow-600" />
                </div>
                <h3 className="text-xl font-black text-navy-700">تنبيه مهم</h3>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-right">
                  <p className="text-yellow-800 font-bold text-sm">⏱ المؤقت يظل يعمل حتى لو خرجت</p>
                  <p className="text-yellow-700 text-xs mt-1">ستُسلَّم إجاباتك تلقائياً عند انتهاء الوقت. هل تريد تسليم إجاباتك الآن وإنهاء الاختبار؟</p>
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowCancelConfirm(false)} className="flex-1 btn-secondary py-3">
                    العودة للاختبار
                  </button>
                  <button
                    onClick={() => { setShowCancelConfirm(false); handleSubmit(); }}
                    disabled={submitMut.isPending}
                    className="flex-1 btn-primary py-3 !bg-yellow-500 hover:!bg-yellow-600">
                    تسليم وخروج
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSubmitConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-xl font-black text-navy-700">تأكيد التسليم</h3>
                {answered < questions.length ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                    <p className="text-yellow-800 font-bold text-sm">⚠️ أجبت على {answered} من {questions.length} سؤال</p>
                    <p className="text-yellow-700 text-xs mt-1">{questions.length - answered} سؤال لم تُجب عليه — لن تحصل على درجتها</p>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <p className="text-green-800 font-bold text-sm">✓ أجبت على جميع الأسئلة ({questions.length})</p>
                  </div>
                )}
                <p className="text-gray-500 text-sm">لا يمكن التراجع عن التسليم بعد التأكيد</p>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowSubmitConfirm(false)} className="flex-1 btn-secondary py-3">
                    العودة للاختبار
                  </button>
                  <button
                    onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}
                    disabled={submitMut.isPending}
                    className="flex-1 btn-primary py-3">
                    تسليم نهائي
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </>
    );
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <FileText className="w-7 h-7 text-orange-500" /> الاختبارات
        </h1>

        {/* ── Active In-Progress Exam Banner ── */}
        {activeInProgressExam && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border-2 border-amber-400 dark:border-amber-500/60 p-4 sm:p-5 shadow-lg shadow-amber-500/10 transition-all">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/30 flex-shrink-0 animate-pulse">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">
                      ⚡ لديك اختبار جارٍ
                    </span>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      الوقت مستمر ⏳
                    </span>
                  </div>
                  <h3 className="font-black text-navy-800 dark:text-[var(--dk-text-1)] text-base mt-1 line-clamp-1">
                    {activeInProgressExam.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => openExam(activeInProgressExam)}
                disabled={startingId === activeInProgressExam.id}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-sm shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
              >
                {startingId === activeInProgressExam.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                استئناف الاختبار الآن
              </button>
            </div>
          </div>
        )}

        {/* ── My Exam History (all attempts + absent records) ─────────────────── */}
        {myResults.length > 0 && (
          <div className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
            showHistory
              ? 'border-amber-300 dark:border-amber-500/40 shadow-sm shadow-amber-100 dark:shadow-none'
              : 'border-gray-200 dark:border-[var(--dk-border)]'
          }`}>
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                showHistory
                  ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                  : 'bg-white dark:bg-[var(--dk-surface)] hover:bg-gray-50 dark:hover:bg-[var(--dk-elevated)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${ showHistory ? 'text-amber-500' : 'text-gray-400'}`} />
                <span className={`text-sm font-bold ${ showHistory ? 'text-amber-700 dark:text-amber-300' : 'text-navy-700 dark:text-[var(--dk-text-1)]'}`}>سجل اختباراتي</span>
                <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${
                  showHistory
                    ? 'bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-300'
                    : 'bg-gray-100 dark:bg-[var(--dk-elevated)] text-gray-500 dark:text-[var(--dk-text-2)]'
                }`}>
                  {myResults.length}
                </span>
              </div>
              {showHistory
                ? <ChevronUp className="w-4 h-4 text-amber-500" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showHistory && (
              <div className="divide-y divide-amber-100 dark:divide-amber-900/20 bg-amber-50/40 dark:bg-amber-900/10">
                {myResults.map(r => {
                  const isAbsent = r.is_absent === true || r.is_absent === 'true';
                  const passed = !isAbsent && Number(r.score) >= Number(r.pass_score);
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isAbsent ? 'bg-gray-100 dark:bg-[var(--dk-elevated)]' : passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {isAbsent
                          ? <Clock className="w-4 h-4 text-gray-400" />
                          : passed
                            ? <CheckCircle className="w-4 h-4 text-green-600" />
                            : <X className="w-4 h-4 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] truncate">{r.exam_title}</p>
                          {r.course_name && (
                            <span className="text-[10px] text-gray-400 dark:text-[var(--dk-text-2)] font-medium">({r.course_name})</span>
                          )}
                          {isAbsent && (
                            <span className="text-[10px] bg-gray-100 dark:bg-[var(--dk-elevated)] text-gray-500 rounded-full px-1.5 py-0.5 font-bold">غائب</span>
                          )}
                          {!isAbsent && r.is_latest && (
                            <span className="text-[10px] bg-navy-50 dark:bg-navy-900/30 text-navy-600 dark:text-navy-300 rounded-full px-1.5 py-0.5 font-bold">الأخيرة</span>
                          )}
                          {!isAbsent && !r.is_latest && (
                            <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded-full px-1.5 py-0.5 font-bold">محاولة سابقة</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-[var(--dk-text-2)] mt-0.5">
                          {new Date(r.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isAbsent ? (
                          <span className="text-xs font-black text-gray-400">غائب</span>
                        ) : (
                          <>
                            <span className={`text-xs font-black ${passed ? 'text-green-600' : 'text-red-500'}`}>
                              {r.score}/{r.total_score}
                            </span>
                            {/* Review button — always visible EXCEPT when latest+failed+retry pending
                                (pending retry: hide so student can't study the answers before retaking) */}
                            {!(r.is_latest && !passed && retryMap[r.exam_id]?.status === 'pending') && (
                              <button
                                onClick={() => navigate(`/student/exam-review/${r.id}`)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                                title="مراجعة الإجابات"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Retry controls — only for latest failed attempt */}
                            {!passed && r.is_latest && (() => {
                              const myRetry = retryMap[r.exam_id];
                              if (myRetry?.status === 'pending') {
                                return (
                                  <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-bold px-1.5 py-0.5 rounded-full" title="طلب الإعادة قيد المراجعة">
                                    ⏳ معلّق
                                  </span>
                                );
                              }
                              if (myRetry?.status === 'rejected') {
                                return (
                                  <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.5 rounded-full" title={myRetry.teacher_note || 'رُفض طلب الإعادة'}>
                                    ✗ رُفض
                                  </span>
                                );
                              }
                              return (
                                <button
                                  onClick={() => { setRetryModal({ id: r.exam_id, title: r.exam_title }); setRetryMessage(''); }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                                  title="طلب إعادة الاختبار"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              );
                            })()}
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

        {/* ── Stuck session warning ── */}
        {stuckExamIds.length > 0 && !taking && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 space-y-3">
            <p className="font-bold text-yellow-800 text-sm">
              ⚠️ يوجد {stuckExamIds.length === 1 ? 'اختبار' : `${stuckExamIds.length} اختبارات`} بجلسة معلّقة من زيارة سابقة
            </p>
            <p className="text-yellow-700 text-xs">
              إذا كنت لا تستطيع فتح الاختبار أو تظهر مشكلة، امسح الجلسة المعلّقة:
            </p>
            <div className="flex flex-wrap gap-2">
              {stuckExamIds.map(id => {
                const examTitle = exams.find(e => e.id === id)?.title || `اختبار #${id}`;
                return (
                  <button key={id}
                    onClick={() => clearStuckSession(id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-900 font-bold text-xs rounded-xl transition-colors">
                    <X className="w-3.5 h-3.5" /> مسح: {examTitle}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {result && (() => {
          const passScore = result.pass_score ?? result.result?.pass_score ?? 50;
          const passed = result.normalizedScore >= passScore;
          const examId = result.result?.exam_id;
          const examTitle = exams.find(e => e.id === examId)?.title || '';
          return (
            <div className={`card text-center border-2 ${passed ? 'border-green-300 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20' : 'border-red-300 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20'}`}>
              <div className="text-5xl mb-3">{passed ? '🎉' : '📚'}</div>
              <h2 className="text-2xl font-black text-navy-700 dark:text-[var(--dk-text-1)] mb-1">النتيجة</h2>
              <p className={`text-4xl font-black mb-3 ${passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {result.normalizedScore}/{result.total_score ?? result.result?.total_score ?? 100}
              </p>
              <div className="flex justify-center gap-6 text-sm flex-wrap">
                <span className="text-green-700 dark:text-green-400 font-bold">✓ صواب: {result.result.correct_count}</span>
                <span className="text-red-700 dark:text-red-400 font-bold">✗ خطأ: {result.result.wrong_count}</span>
              </div>
              {result.pointsEarned > 0 && <p className="mt-3 text-orange-700 dark:text-orange-400 font-bold">+{result.pointsEarned} نقطة! ⭐</p>}

              {passed ? (
                <div className="mt-4 flex gap-3 justify-center flex-wrap">
                  <button onClick={() => setResult(null)} className="btn-primary">حسناً 🎉</button>
                  {result.result?.id && (
                    <button
                      onClick={() => { navigate(`/student/exam-review/${result.result.id}`); setResult(null); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-navy-200 dark:border-[var(--dk-border)] hover:border-navy-400 dark:hover:border-[var(--dk-border-md)] hover:bg-navy-50 dark:hover:bg-[var(--dk-elevated)] text-navy-700 dark:text-[var(--dk-text-1)] font-bold text-sm transition-all">
                      <Eye className="w-4 h-4" /> مراجعة الإجابات
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className="bg-white/80 dark:bg-[var(--dk-elevated)] border border-red-200 dark:border-red-900/40 rounded-xl px-4 py-3">
                    <p className="text-navy-700 dark:text-[var(--dk-text-1)] font-black text-base">هل تريد إعادة هذا الاختبار؟</p>
                    <p className="text-gray-500 dark:text-[var(--dk-text-2)] text-xs mt-1">
                      لو اخترت "نعم" — سيُرسَل طلب للمعلم ولن تتمكن من مراجعة الإجابات حتى يُبَتّ في طلبك
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        retryRequestMut.mutate({ examId, message: '' }, { onSuccess: () => setResult(null) });
                      }}
                      disabled={retryRequestMut.isPending}
                      className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      نعم، أريد الإعادة
                    </button>
                    <button
                      onClick={() => setResult(null)}
                      className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-[var(--dk-border)] hover:border-gray-400 dark:hover:bg-[var(--dk-elevated)] text-gray-600 dark:text-[var(--dk-text-2)] font-black text-sm transition-all"
                    >
                      لا، شكراً
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Retry Request Modal */}
        {retryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-black text-navy-700">طلب إعادة الاختبار</h3>
                  <p className="text-xs text-gray-500">{retryModal.title}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-navy-700 mb-1">سبب طلب الإعادة (اختياري)</label>
                <textarea
                  value={retryMessage}
                  onChange={e => setRetryMessage(e.target.value)}
                  className="input-field h-24 resize-none text-sm"
                  placeholder="اكتب سبب طلبك لإعادة هذا الاختبار..."
                />
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                سيتم إرسال طلبك للمعلم للمراجعة. في حالة الموافقة ستتمكن من إعادة تأدية الاختبار من جديد.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setRetryModal(null)} className="flex-1 btn-secondary">إلغاء</button>
                <button
                  onClick={() => retryRequestMut.mutate({ examId: retryModal.id, message: retryMessage })}
                  disabled={retryRequestMut.isPending}
                  className="flex-1 btn-primary"
                >
                  {retryRequestMut.isPending ? 'جاري الإرسال...' : 'إرسال الطلب'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)
        ) : (() => {
          // Show only exams not yet taken, or taken but retry is approved (student can retake)
          const availableExams = exams.filter(ex => !ex.already_taken || retryMap[ex.id]?.status === 'approved');
          if (availableExams.length === 0) {
            return (
              <div className="card text-center py-12">
                <CheckCircle className="w-14 h-14 mx-auto mb-3 text-green-400" />
                <p className="text-gray-700 font-black text-base">أنهيت جميع الاختبارات المتاحة 🎉</p>
                <p className="text-gray-400 text-sm mt-1">راجع نتائجك في سجل اختباراتي أعلاه</p>
              </div>
            );
          }
          return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {availableExams.map(ex => {
              const scheduleStatus = getExamScheduleStatus(ex, scheduleNow);
              const isUpcoming = scheduleStatus === 'upcoming';
              const isExpired = scheduleStatus === 'expired';
              const isSessionInProgress = !ex.already_taken && !isExpired && !isUpcoming && (() => {
                try {
                  const uId = user?.id || 0;
                  return !!(
                    localStorage.getItem(`exam_answers_${uId}_${ex.id}`) ||
                    localStorage.getItem(`exam_active_${uId}_${ex.id}`) ||
                    localStorage.getItem(`exam_start_${uId}_${ex.id}`) ||
                    localStorage.getItem(`exam_answers_${ex.id}`) ||
                    localStorage.getItem(`exam_start_${ex.id}`)
                  );
                } catch (_) { return false; }
              })();
              return (
                <div key={ex.id} className={`card !p-4 transition-all ${
                  isSessionInProgress
                    ? 'border-2 border-amber-400 dark:border-amber-500/60 bg-amber-50/20 dark:bg-amber-950/10 shadow-md shadow-amber-500/10'
                    : ex.already_taken
                      ? 'border-2 border-green-300 dark:border-green-800/50'
                      : isExpired
                        ? 'opacity-60'
                        : ''
                }`}>
                  {/* Card Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSessionInProgress
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-md shadow-orange-500/30 text-white'
                        : ex.already_taken
                          ? 'bg-green-100'
                          : isExpired || isUpcoming
                            ? 'bg-gray-100'
                            : 'bg-gradient-to-br from-orange-500 to-orange-700'
                    }`}>
                      {isSessionInProgress
                        ? <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        : ex.already_taken
                          ? <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" />
                          : (isExpired || isUpcoming)
                            ? <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                            : <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-navy-600 text-sm leading-snug">{ex.title}</h3>
                        <div className="flex-shrink-0">
                          {isSessionInProgress && (
                            <span className="text-[10px] sm:text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-black px-2.5 py-0.5 rounded-full whitespace-nowrap animate-pulse flex items-center gap-1 border border-amber-300 dark:border-amber-700/50">
                              ⚡ جاري الاختبار
                            </span>
                          )}
                          {!isSessionInProgress && ex.already_taken && <Badge variant="success">✓ أُدي</Badge>}
                          {!isSessionInProgress && isUpcoming && <span className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">⏳ قريباً</span>}
                          {!isSessionInProgress && isExpired && <span className="text-[10px] sm:text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">🔒 انتهى</span>}
                        </div>
                      </div>
                      {ex.course_name && <p className="text-xs text-gray-500 font-medium mt-0.5">{ex.course_name}</p>}
                    </div>
                  </div>

                  {/* Info chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
                    <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">⏱ {ex.duration_minutes} د</span>
                    <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">📊 {ex.total_score} درجة</span>
                    <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">✓ نجاح: {ex.pass_score}</span>
                    {ex.badge_name && <span className="bg-orange-100 text-orange-800 font-semibold px-2 py-1 rounded-lg">🏅 {ex.badge_name}</span>}
                  </div>

                  {(ex.start_date || ex.end_date) && (
                    <div className="flex items-start gap-1.5 mb-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">
                        {ex.start_date && `من ${formatEgyptDateTime(ex.start_date)}`}
                        {ex.end_date && ` · حتى ${formatEgyptDateTime(ex.end_date)}`}
                      </span>
                    </div>
                  )}

                  {isUpcoming && ex.start_date && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-yellow-800 font-bold">
                          يبدأ في: {formatEgyptDateTime(ex.start_date, { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                         <ExamCountdownBadge targetDate={ex.start_date} onExpire={refreshScheduleState} />
                      </div>
                    </div>
                  )}

                  {ex.already_taken && retryMap[ex.id]?.status !== 'approved' ? (() => {
                    const passed = ex.score >= ex.pass_score;
                    const myRetry = retryMap[ex.id];
                    return (
                      <div className="space-y-2">
                        <div className={`text-center py-2 rounded-xl font-bold text-lg ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {ex.score}/{ex.total_score}
                        </div>

                        {/* Passed: always show review */}
                        {passed && (
                          <button onClick={() => navigate(`/student/exam-review/${ex.already_taken}`)}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-navy-200 dark:border-[var(--dk-border)] hover:border-navy-400 dark:hover:bg-[var(--dk-elevated)] hover:bg-navy-50 text-navy-700 dark:text-[var(--dk-text-1)] text-sm font-bold transition-all">
                            <Eye className="w-4 h-4" /> مراجعة الإجابات
                          </button>
                        )}

                        {/* Failed: show retry OR review depending on state */}
                        {!passed && (
                          myRetry?.status === 'pending' ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 rounded-xl text-xs text-yellow-800 dark:text-yellow-300 font-bold">
                              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                              طلب الإعادة قيد المراجعة — المراجعة متاحة بعد البت في الطلب
                            </div>
                          ) : myRetry?.status === 'rejected' ? (
                            <>
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl text-xs text-red-700 dark:text-red-400 font-bold">
                                <X className="w-3.5 h-3.5 flex-shrink-0" />
                                رُفض طلب الإعادة{myRetry.teacher_note ? ` — ${myRetry.teacher_note}` : ''}
                              </div>
                              <button onClick={() => navigate(`/student/exam-review/${ex.already_taken}`)}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-navy-200 dark:border-[var(--dk-border)] hover:border-navy-400 dark:hover:bg-[var(--dk-elevated)] hover:bg-navy-50 text-navy-700 dark:text-[var(--dk-text-1)] text-sm font-bold transition-all">
                                <Eye className="w-4 h-4" /> مراجعة الإجابات
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => navigate(`/student/exam-review/${ex.already_taken}`)}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-navy-200 dark:border-[var(--dk-border)] hover:border-navy-400 dark:hover:bg-[var(--dk-elevated)] hover:bg-navy-50 text-navy-700 dark:text-[var(--dk-text-1)] text-sm font-bold transition-all">
                                <Eye className="w-4 h-4" /> مراجعة الإجابات
                              </button>
                              <button
                                onClick={() => { setRetryModal(ex); setRetryMessage(''); }}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-orange-200 dark:border-orange-700/40 hover:border-orange-400 dark:hover:bg-orange-900/20 hover:bg-orange-50 text-orange-700 dark:text-orange-400 text-sm font-bold transition-all"
                              >
                                <RotateCcw className="w-4 h-4" /> طلب إعادة الاختبار
                              </button>
                            </>
                          )
                        )}
                      </div>
                    );
                  })() : (
                    <button
                      onClick={() => openExam(ex)}
                      disabled={isUpcoming || (isExpired && retryMap[ex.id]?.status !== 'approved') || startingId === ex.id}
                      className={`w-full flex items-center justify-center gap-2 font-black transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSessionInProgress
                          ? 'py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-sm shadow-lg shadow-orange-500/25 active:scale-[0.98]'
                          : 'btn-primary'
                      }`}
                    >
                      {startingId === ex.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {isSessionInProgress ? 'جاري الاستئناف...' : 'جاري التحميل...'}
                        </>
                      ) : isSessionInProgress ? (
                        <>
                          <RotateCcw className="w-4 h-4" /> استئناف الاختبار
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> ابدأ الاختبار
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          );
        })()}

      </div>
    </div>
  );
}
