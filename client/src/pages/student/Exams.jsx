import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Play, Eye, Calendar, Lock, RotateCcw, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

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
  const seed = ((studentId * 1000003) ^ (q.id * 999983)) >>> 0;
  return seededShuffle(allOpts, seed);
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

  const answersRef = useRef({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

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
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const takingRef = useRef(null);
  const examDataRef = useRef(null);
  const startTimeRef = useRef(null);
  useEffect(() => { takingRef.current = taking; }, [taking]);
  useEffect(() => { examDataRef.current = examData; }, [examData]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);

  const handleSubmit = useCallback(() => {
    if (!taking || !examData) return;
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
      const token = localStorage.getItem('wathba_token');
      if (!token) return;
      const payload = JSON.stringify({ answers: answersRef.current, start_time: startTimeRef.current });
      fetch(`/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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

    // Restore saved answers if returning to the exam
    try {
      const saved = localStorage.getItem(answersKey);
      if (saved) setAnswers(JSON.parse(saved));
    } catch (_) {}

    let startTs = parseInt(localStorage.getItem(storageKey) || '0', 10);
    if (!startTs) {
      startTs = Date.now();
      localStorage.setItem(storageKey, String(startTs));
    }
    const startIso = new Date(startTs).toISOString();
    setStartTime(startIso);

    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    const remaining = durationSecs - elapsed;

    if (remaining <= 0) {
      localStorage.removeItem(storageKey);
      submitMut.mutate({ id: examId, data: { answers: answersRef.current, start_time: startIso } });
      return;
    }

    setTimeLeft(remaining);

    let timerActive = true;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          localStorage.removeItem(storageKey);
          // Guard: only submit if component is still mounted and exam still active
          if (timerActive) {
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
    setAnswers({}); setResult(null);
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
      <div className="h-full overflow-y-auto p-4 lg:p-6">
        <div className="space-y-6">
          <div className="card bg-navy-600 text-white !p-3 sm:!p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-xl font-black text-white leading-snug truncate">{exam.title}</h2>
                <p className="text-navy-100 text-xs sm:text-sm font-medium mt-0.5">{answered}/{questions.length} سؤال أُجيب عليه</p>
              </div>
              <div className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-xl ${timeLeft < 60 ? 'bg-red-500/30 text-red-200 animate-pulse' : 'bg-white/10 text-orange-300'}`}>
                <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-lg sm:text-2xl font-black tabular-nums">{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-orange-500 h-2.5 rounded-full transition-all" style={{ width: `${(answered / questions.length) * 100}%` }} />
          </div>

          <div className="space-y-6">
            {questions.map((q, qi) => {
              const qType = q.question_type || 'mcq';
              return (
                <div key={q.id} className={`card ${answers[q.id] ? 'border-2 border-orange-400' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-gray-600 font-bold">السؤال {qi + 1}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${qType === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                      {qType === 'true_false' ? 'صح/خطأ' : 'MCQ'}
                    </span>
                  </div>
                  <p className="font-semibold text-navy-700 mb-4 text-base leading-relaxed">{q.question_text}</p>
                  {q.question_image_url && (
                    <img src={q.question_image_url} alt="سؤال" className="w-full max-w-xs h-40 object-cover rounded-xl mb-4" />
                  )}

                  {qType === 'true_false' ? (
                    <div className="flex gap-4">
                      {[{ opt: 'A', label: '✅ صح' }, { opt: 'B', label: '❌ خطأ' }].map(({ opt, label }) => (
                        <button key={opt} onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                          className={`flex-1 py-3 rounded-xl text-base font-bold border-2 transition-all ${answers[q.id] === opt ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(() => {
                        const shuffledOpts = getShuffledOpts(q, studentId, exam.shuffle_options);
                        const displayLabels = ['أ', 'ب', 'ج', 'د'];
                        return shuffledOpts.map((origOpt, idx) => (
                          <button key={origOpt} onClick={() => setAnswers({ ...answers, [q.id]: origOpt })}
                            className={`p-3 rounded-xl text-sm font-semibold text-right transition-all border-2 ${answers[q.id] === origOpt ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-300 hover:border-navy-400 hover:bg-navy-50 text-navy-700'}`}>
                            <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ml-2 ${answers[q.id] === origOpt ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{displayLabels[idx]}</span>
                            {q[`option_${origOpt.toLowerCase()}`]}
                          </button>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-4">
            <button onClick={() => { setTaking(null); }} className="btn-secondary flex-1">إلغاء</button>
            <button onClick={() => setShowSubmitConfirm(true)} disabled={submitMut.isPending}
              className="btn-primary flex-1 py-3 text-base">
              {submitMut.isPending ? 'جاري الإرسال...' : `تسليم الاختبار (${answered}/${questions.length})`}
            </button>
          </div>

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
                    <p className="text-yellow-700 text-xs mt-1">{questions.length - answered} سؤال لم تُجب عليه بعد — ستُحسب أسئلة فارغة كإجابة خاطئة</p>
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

        {result && (
          <div className={`card text-center border-2 ${result.normalizedScore >= (result.pass_score ?? result.result?.pass_score ?? 50) ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <div className="text-5xl mb-3">{result.normalizedScore >= (result.pass_score ?? result.result?.pass_score ?? 50) ? '🎉' : '📚'}</div>
            <h2 className="text-2xl font-black text-navy-700 mb-1">النتيجة</h2>
            <p className={`text-4xl font-black mb-3 ${result.normalizedScore >= (result.pass_score ?? result.result?.pass_score ?? 50) ? 'text-green-800' : 'text-red-800'}`}>{result.normalizedScore}/{result.result?.total_score ?? 100}</p>
            <div className="flex justify-center gap-6 text-sm flex-wrap">
              <span className="text-green-800 font-bold">✓ صواب: {result.result.correct_count}</span>
              <span className="text-red-800 font-bold">✗ خطأ: {result.result.wrong_count}</span>
            </div>
            {result.pointsEarned > 0 && <p className="mt-3 text-orange-700 font-bold">+{result.pointsEarned} نقطة! ⭐</p>}
            <button onClick={() => setResult(null)} className="btn-primary mt-4">حسناً</button>
          </div>
        )}

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exams.map(ex => {
              const scheduleStatus = getExamScheduleStatus(ex);
              const isUpcoming = scheduleStatus === 'upcoming';
              const isExpired = scheduleStatus === 'expired';
              return (
                <div key={ex.id} className={`card ${ex.already_taken ? 'border-2 border-green-300' : isExpired ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${ex.already_taken ? 'bg-green-100' : isExpired || isUpcoming ? 'bg-gray-100' : 'bg-gradient-to-br from-orange-500 to-orange-700'}`}>
                        {ex.already_taken ? <CheckCircle className="w-6 h-6 text-green-700" /> : (isExpired || isUpcoming) ? <Lock className="w-6 h-6 text-gray-400" /> : <FileText className="w-6 h-6 text-white" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-navy-600 text-sm">{ex.title}</h3>
                        {ex.course_name && <p className="text-xs text-gray-600 font-medium">{ex.course_name}</p>}
                      </div>
                    </div>
                    {ex.already_taken && <Badge variant="success">✓ أُدي</Badge>}
                    {isUpcoming && <span className="text-xs bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full">⏳ قريباً</span>}
                    {isExpired && <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">🔒 انتهى</span>}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">⏱ {ex.duration_minutes} دقيقة</span>
                    <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">📊 من {ex.total_score}</span>
                    <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">✓ النجاح: {ex.pass_score}</span>
                    {ex.badge_name && <span className="bg-orange-100 text-orange-800 font-semibold px-2 py-1 rounded-lg">🏅 {ex.badge_name}</span>}
                  </div>

                  {(ex.start_date || ex.end_date) && (
                    <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
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
                        <button onClick={() => navigate(`/student/exam-review/${ex.already_taken}`)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-navy-200 hover:border-navy-400 hover:bg-navy-50 text-navy-700 text-sm font-bold transition-all">
                          <Eye className="w-4 h-4" /> مراجعة الإجابات
                        </button>
                        {!passed && (
                          myRetry?.status === 'pending' ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800 font-bold">
                              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                              في انتظار موافقة المعلم على طلب الإعادة
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
