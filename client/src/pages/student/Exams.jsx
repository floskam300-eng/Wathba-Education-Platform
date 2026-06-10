import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Play, Eye, Calendar, Lock, RotateCcw, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import MathText from '../../components/MathText';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

import { withToken } from '../../lib/mediaAccess';

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
  const allOpts = ['A', 'B', 'C', 'D'].filter(o => q[`option_${o.toLowerCase()}`]);
  if (!shuffleOptions) return allOpts;
  const seed = (((studentId || 1) * 1000003) ^ ((q.id || 1) * 999983)) >>> 0;
  return seededShuffle(allOpts, seed || 1);
}

const getExamScheduleStatus = (ex) => {
  const now = new Date();
  if (ex.start_date && new Date(ex.start_date) > now) return 'upcoming';
  if (ex.end_date && new Date(ex.end_date) < now) return 'expired';
  return 'open';
};

// Isolated countdown badge — manages its own 1s timer to avoid re-rendering the whole page
const ExamCountdownBadge = React.memo(function ExamCountdownBadge({ targetDate }) {
  const [display, setDisplay] = useState(() => formatCountdown(new Date(targetDate).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      const msLeft = new Date(targetDate).getTime() - Date.now();
      setDisplay(msLeft > 0 ? formatCountdown(msLeft) : null);
    }, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
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

  const answersRef = useRef({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Guard against double-submission from timer + manual submit racing
  const submittedRef = useRef(false);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['student-exams'],
    queryFn: () => api.get('/exams/student/available').then(r => r.data),
  });

  // Auto-refresh when upcoming exams hit their start time (client-side fallback)
  useEffect(() => {
    if (!exams.length) return;
    const upcomingDates = exams
      .filter(ex => ex.start_date && new Date(ex.start_date) > new Date())
      .map(ex => new Date(ex.start_date).getTime());
    if (!upcomingDates.length) return;

    const timers = upcomingDates.map(ts => {
      const delay = ts - Date.now();
      if (delay <= 0) return null;
      return setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['student-exams'] });
      }, delay + 500);
    }).filter(Boolean);

    return () => timers.forEach(t => clearTimeout(t));
  }, [exams, qc]);

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
  });

  const retryMap = retryRequests.reduce((acc, r) => { acc[r.exam_id] = r; return acc; }, {});

  const { data: examData } = useQuery({
    queryKey: ['exam-take', taking?.id],
    queryFn: () => api.get(`/exams/${taking?.id}/take`).then(r => r.data),
    enabled: !!taking && !taking.already_taken,
  });

  const retryRequestMut = useMutation({
    mutationFn: ({ examId, message }) => api.post(`/exams/${examId}/retry-request`, { message }),
    onSuccess: () => {
      qc.invalidateQueries(['student-retry-requests']);
      toast.success('تم إرسال طلب إعادة الاختبار للمعلم');
      setRetryModal(null);
      setRetryMessage('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const submitMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/exams/${id}/submit`, data),
    onSuccess: (res, variables) => {
      localStorage.removeItem(`exam_start_${variables.id}`);
      localStorage.removeItem(`exam_answers_${variables.id}`);
      setResult(res.data);
      setTaking(null);
      qc.invalidateQueries(['student-exams']);
      qc.invalidateQueries(['student-dashboard']);
    },
    onError: (e, variables) => {
      const status = e.response?.status;
      if (status === 409) {
        // Already submitted (e.g., duplicate keepalive) — clean up and refresh
        localStorage.removeItem(`exam_start_${variables.id}`);
        localStorage.removeItem(`exam_answers_${variables.id}`);
        setTaking(null);
        qc.invalidateQueries(['student-exams']);
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

  // Must be declared here (before any early returns) to satisfy the Rules of Hooks.
  // When the exam-taking view is active, this will always return [] due to the
  // `if (taking) return []` guard inside the memo.
  const stuckExamIds = React.useMemo(() => {
    if (taking) return [];
    try {
      return Object.keys(localStorage)
        .filter(k => k.startsWith('exam_start_'))
        .map(k => parseInt(k.replace('exam_start_', ''), 10))
        .filter(id => !isNaN(id));
    } catch (_) { return []; }
  }, [taking, exams]);

  const clearStuckSession = (examId) => {
    try {
      localStorage.removeItem(`exam_start_${examId}`);
      localStorage.removeItem(`exam_answers_${examId}`);
    } catch (_) {}
    window.location.reload();
  };

  const handleSubmit = useCallback(() => {
    if (!taking || !examData || submittedRef.current) return;
    submittedRef.current = true;
    submitMut.mutate({ id: taking.id, data: { answers: answersRef.current, start_time: startTime } });
  }, [taking, examData, startTime]);

  // ── Save answers to localStorage whenever they change ──
  useEffect(() => {
    if (!taking) return;
    try { localStorage.setItem(`exam_answers_${taking.id}`, JSON.stringify(answers)); } catch (_) {}
  }, [answers, taking]);

  // ── Auto-submit only when browser/tab is CLOSED (not just hidden) ──
  useEffect(() => {
    const sendKeepaliveSubmit = (examId) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const token = localStorage.getItem('wathba_token');
      if (!token) return;
      const payload = JSON.stringify({ answers: answersRef.current, start_time: startTimeRef.current });
      // keepalive fetch is intentional here (axios doesn't support keepalive for
      // tab-close unload events). Include X-Tenant-Slug so the server can resolve
      // the tenant on multi-tenant setups. [M-18 keepalive fix]
      const slug = localStorage.getItem('wathba_teacher_slug') || '';
      const hdrs = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      if (slug) hdrs['X-Tenant-Slug'] = slug;
      fetch(`/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: hdrs,
        body: payload,
        keepalive: true,
      }).catch(() => {});
      // Do NOT clear localStorage here — if the fetch fails silently, the student
      // needs their saved state to resume. Keys are cleared on successful submission.
    };

    const handleBeforeUnload = (e) => {
      if (!takingRef.current || !examDataRef.current) return;
      sendKeepaliveSubmit(takingRef.current.id);
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!examData || !taking) return;
    const examId = taking.id;
    const storageKey = `exam_start_${examId}`;
    const answersKey = `exam_answers_${examId}`;
    const durationSecs = examData.exam.duration_minutes * 60;

    // Use the server-authoritative start time to set the timer.
    // This prevents:
    //   - Timer cheating (student can't fake an earlier start in localStorage)
    //   - Stale data from a previous attempt being used on retry
    //     (server creates a fresh session on retry; its started_at is newer)
    let startTs;
    if (examData.serverStartedAt) {
      const serverTs = new Date(examData.serverStartedAt).getTime();
      const localTs  = parseInt(localStorage.getItem(storageKey) || '0', 10);
      // If localStorage is newer than the server session by >60 s, it must be
      // stale data from a previous attempt (e.g. retry) — discard it.
      if (localTs && localTs > serverTs + 60_000) {
        try { localStorage.removeItem(answersKey); } catch (_) {}
      }
      startTs = serverTs;
      try { localStorage.setItem(storageKey, String(startTs)); } catch (_) {}
    } else {
      // Fallback: no server session returned (should not normally happen)
      startTs = parseInt(localStorage.getItem(storageKey) || '0', 10);
      if (!startTs) {
        startTs = Date.now();
        try { localStorage.setItem(storageKey, String(startTs)); } catch (_) {}
      }
    }

    // Restore saved answers (after startTs is resolved so we don't restore stale ones)
    try {
      const saved = localStorage.getItem(answersKey);
      if (saved) setAnswers(JSON.parse(saved));
    } catch (_) {}

    const startIso = new Date(startTs).toISOString();
    setStartTime(startIso);

    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    const remaining = durationSecs - elapsed;

    if (remaining <= 0) {
      localStorage.removeItem(storageKey);
      if (!submittedRef.current) {
        submittedRef.current = true;
        submitMut.mutate({ id: examId, data: { answers: answersRef.current, start_time: startIso } });
      }
      return;
    }

    setTimeLeft(remaining);

    let timerActive = true;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          localStorage.removeItem(storageKey);
          // Guard: only submit if component still mounted AND not already submitted
          if (timerActive && !submittedRef.current) {
            submittedRef.current = true;
            submitMut.mutate({ id: examId, data: { answers: answersRef.current, start_time: startIso } });
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => { timerActive = false; clearInterval(interval); };
  }, [examData]);

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
  const openExam = (exam) => {
    const status = getExamScheduleStatus(exam);
    if (status === 'upcoming') return toast.error('الاختبار لم يبدأ بعد');
    if (status === 'expired') return toast.error('انتهى وقت هذا الاختبار');
    // Do NOT clear localStorage here — if a student navigated away mid-exam, their
    // saved answers and timer position should be restored. Stale data from a previous
    // attempt is detected and cleared in the examData useEffect below using the
    // server-authoritative serverStartedAt timestamp.
    setAnswers({}); setResult(null);
    submittedRef.current = false;
    setPendingExam(exam);
    setCountdown(3);
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

  if (taking && examData && !taking.already_taken) {
    const { exam, questions } = examData;
    const answered = Object.keys(answers).filter(k => answers[k]).length;

    return (
      <div className="h-full overflow-y-auto p-3 sm:p-4 lg:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Exam header bar */}
          <div className="card bg-navy-600 text-white !p-3 sm:!p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-lg font-black text-white leading-snug line-clamp-2">{exam.title}</h2>
                <p className="text-navy-100 text-xs font-medium mt-0.5">{answered}/{questions.length} سؤال</p>
              </div>
              <div className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-xl ${timeLeft < 60 ? 'bg-red-500/30 text-red-200 animate-pulse' : 'bg-white/10 text-orange-300'}`}>
                <Clock className="w-4 h-4" />
                <span className="text-lg sm:text-2xl font-black tabular-nums">{formatTime(timeLeft)}</span>
              </div>
            </div>
            {/* Progress bar inline */}
            <div className="w-full bg-white/20 rounded-full h-1.5 mt-3">
              <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${(answered / questions.length) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-4">
            {questions.map((q, qi) => {
              const qType = q.question_type || 'mcq';
              const isGrouped = !!q.group_id;
              // show group context only on the first sub-question of a group
              const showGroupContext = isGrouped && (qi === 0 || questions[qi - 1]?.group_id !== q.group_id);

              return (
                <div key={q.id}>
                  {/* ── Grouped context banner (shown once per group) ── */}
                  {showGroupContext && (q.group_context || q.group_context_image) && (
                    <div className="mb-2 rounded-2xl border-2 border-blue-300 bg-blue-50 overflow-hidden">
                      <div className="px-4 py-2 bg-blue-100 border-b border-blue-200 flex items-center gap-2">
                        <span className="text-xs font-black text-blue-800">📎 اقرأ الآتي ثم أجب على الأسئلة</span>
                        <span className="text-[10px] text-blue-500 font-semibold mr-auto">مجموعة أسئلة مترابطة</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {q.group_context_image && (
                          <img
                            src={withToken(q.group_context_image)}
                            alt="سياق المجموعة"
                            className="w-full max-h-64 object-contain rounded-xl border border-blue-200"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        {q.group_context && (
                          <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap font-medium"><MathText text={q.group_context} /></p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={`card !p-3 sm:!p-5 ${answers[q.id] ? 'border-2 border-orange-400' : isGrouped ? 'border-2 border-blue-200' : 'border border-gray-200'}`}>
                    {/* Question label row */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0 ${isGrouped ? 'bg-blue-600' : 'bg-navy-600'}`}>{qi + 1}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${qType === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                        {qType === 'true_false' ? 'صح/خطأ' : 'اختيار'}
                      </span>
                      {isGrouped && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">جزء من مجموعة</span>
                      )}
                      {answers[q.id] && <span className="text-xs text-green-600 font-bold mr-auto">✓ أُجيب</span>}
                    </div>

                    {q.question_text && (
                      <p className="font-semibold text-navy-700 mb-3 text-sm sm:text-base leading-relaxed"><MathText text={q.question_text} /></p>
                    )}

                    {q.question_image_url && (
                      <img
                        src={withToken(q.question_image_url)}
                        alt="سؤال"
                        className="w-full max-h-48 object-contain rounded-xl mb-3 border border-gray-100"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}

                    {qType === 'true_false' ? (
                      <div className="flex gap-3">
                        {[{ opt: 'A', label: '✅ صح' }, { opt: 'B', label: '❌ خطأ' }].map(({ opt, label }) => (
                          <button key={opt} onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${answers[q.id] === opt ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {(() => {
                          const shuffledOpts = shuffledQuestionsOpts[q.id] || getShuffledOpts(q, studentId, exam.shuffle_options);
                          const displayLabels = ['أ', 'ب', 'ج', 'د'];
                          return shuffledOpts.map((origOpt, idx) => (
                            <button key={origOpt} onClick={() => setAnswers({ ...answers, [q.id]: origOpt })}
                              className={`flex items-center gap-2 p-2.5 sm:p-3 rounded-xl text-sm font-semibold text-right transition-all border-2 ${answers[q.id] === origOpt ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 hover:border-navy-300 hover:bg-navy-50 text-navy-700'}`}>
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${answers[q.id] === origOpt ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{displayLabels[idx]}</span>
                              <span className="flex-1 leading-snug">{q[`option_${origOpt.toLowerCase()}`]}</span>
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submit / Exit buttons — sticky on mobile */}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCancelConfirm(true)} className="btn-secondary flex-none px-4">خروج</button>
            <button onClick={() => setShowSubmitConfirm(true)} disabled={submitMut.isPending}
              className="btn-primary flex-1 py-3 text-sm sm:text-base">
              {submitMut.isPending ? 'جاري الإرسال...' : `تسليم (${answered}/${questions.length})`}
            </button>
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
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <FileText className="w-7 h-7 text-orange-500" /> الاختبارات
        </h1>

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
            <div className={`card text-center border-2 ${passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="text-5xl mb-3">{passed ? '🎉' : '📚'}</div>
              <h2 className="text-2xl font-black text-navy-700 mb-1">النتيجة</h2>
              <p className={`text-4xl font-black mb-3 ${passed ? 'text-green-800' : 'text-red-800'}`}>
                {result.normalizedScore}/{result.total_score ?? result.result?.total_score ?? 100}
              </p>
              <div className="flex justify-center gap-6 text-sm flex-wrap">
                <span className="text-green-800 font-bold">✓ صواب: {result.result.correct_count}</span>
                <span className="text-red-800 font-bold">✗ خطأ: {result.result.wrong_count}</span>
              </div>
              {result.pointsEarned > 0 && <p className="mt-3 text-orange-700 font-bold">+{result.pointsEarned} نقطة! ⭐</p>}

              {passed ? (
                <div className="mt-4 flex gap-3 justify-center flex-wrap">
                  <button onClick={() => setResult(null)} className="btn-primary">حسناً 🎉</button>
                  {result.result?.id && (
                    <button
                      onClick={() => { navigate(`/student/exam-review/${result.result.id}`); setResult(null); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-navy-200 hover:border-navy-400 hover:bg-navy-50 text-navy-700 font-bold text-sm transition-all">
                      <Eye className="w-4 h-4" /> مراجعة الإجابات
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className="bg-white/80 border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-navy-700 font-black text-base">هل تريد إعادة هذا الاختبار؟</p>
                    <p className="text-gray-500 text-xs mt-1">
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
                      onClick={() => {
                        if (result.result?.id) navigate(`/student/exam-review/${result.result.id}`);
                        setResult(null);
                      }}
                      className="flex-1 py-3 rounded-xl border-2 border-navy-200 hover:border-navy-400 hover:bg-navy-50 text-navy-700 font-black text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      لا، مراجعة الإجابات
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
        ) : exams.length === 0 ? (
          <div className="card text-center py-16">
            <FileText className="w-16 h-16 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 font-medium">لا توجد اختبارات متاحة حالياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {exams.map(ex => {
              const scheduleStatus = getExamScheduleStatus(ex);
              const isUpcoming = scheduleStatus === 'upcoming';
              const isExpired = scheduleStatus === 'expired';
              return (
                <div key={ex.id} className={`card !p-4 ${ex.already_taken ? 'border-2 border-green-300' : isExpired ? 'opacity-60' : ''}`}>
                  {/* Card Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${ex.already_taken ? 'bg-green-100' : isExpired || isUpcoming ? 'bg-gray-100' : 'bg-gradient-to-br from-orange-500 to-orange-700'}`}>
                      {ex.already_taken
                        ? <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" />
                        : (isExpired || isUpcoming)
                          ? <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                          : <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-navy-600 text-sm leading-snug">{ex.title}</h3>
                        <div className="flex-shrink-0">
                          {ex.already_taken && <Badge variant="success">✓ أُدي</Badge>}
                          {isUpcoming && <span className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">⏳ قريباً</span>}
                          {isExpired && <span className="text-[10px] sm:text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">🔒 انتهى</span>}
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
                        {ex.start_date && `من ${new Date(ex.start_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`}
                        {ex.end_date && ` · حتى ${new Date(ex.end_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`}
                      </span>
                    </div>
                  )}

                  {isUpcoming && ex.start_date && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-yellow-800 font-bold">
                          يبدأ في: {new Date(ex.start_date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <ExamCountdownBadge targetDate={ex.start_date} />
                      </div>
                    </div>
                  )}

                  {ex.already_taken ? (() => {
                    const passed = ex.score >= ex.pass_score;
                    const myRetry = retryMap[ex.id];
                    return (
                      <div className="space-y-2">
                        <div className={`text-center py-2 rounded-xl font-bold text-lg ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {ex.score}/{ex.total_score}
                        </div>

                        {/* مراجعة الإجابات — مخفية لو في طلب إعادة معلّق */}
                        {myRetry?.status !== 'pending' ? (
                          <button onClick={() => navigate(`/student/exam-review/${ex.already_taken}`)}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-navy-200 hover:border-navy-400 hover:bg-navy-50 text-navy-700 text-sm font-bold transition-all">
                            <Eye className="w-4 h-4" /> مراجعة الإجابات
                          </button>
                        ) : null}

                        {!passed && (
                          myRetry?.status === 'pending' ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 px-3 py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800 font-bold">
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                طلب الإعادة قيد المراجعة — المراجعة متاحة بعد البت في الطلب
                              </div>
                            </div>
                          ) : myRetry?.status === 'rejected' ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold">
                              <X className="w-3.5 h-3.5 flex-shrink-0" />
                              رُفض طلب الإعادة{myRetry.teacher_note ? ` — ${myRetry.teacher_note}` : ''}
                            </div>
                          ) : (
                            <button
                              onClick={() => { setRetryModal(ex); setRetryMessage(''); }}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 text-orange-700 text-sm font-bold transition-all"
                            >
                              <RotateCcw className="w-4 h-4" /> طلب إعادة الاختبار
                            </button>
                          )
                        )}
                      </div>
                    );
                  })() : (
                    <button onClick={() => openExam(ex)}
                      disabled={isExpired || isUpcoming}
                      className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <Play className="w-4 h-4" /> ابدأ الاختبار
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
