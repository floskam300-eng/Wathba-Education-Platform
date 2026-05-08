import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Play, Eye, Calendar, Lock, AlignLeft } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const getExamScheduleStatus = (ex) => {
  const now = new Date();
  if (ex.start_date && new Date(ex.start_date) > now) return 'upcoming';
  if (ex.end_date && new Date(ex.end_date) < now) return 'expired';
  return 'open';
};

export default function StudentExams() {
  const qc = useQueryClient();
  const [taking, setTaking] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [pendingExam, setPendingExam] = useState(null);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['student-exams'],
    queryFn: () => api.get('/exams/student/available').then(r => r.data),
  });

  const { data: examData } = useQuery({
    queryKey: ['exam-take', taking?.id],
    queryFn: () => api.get(`/exams/${taking?.id}/take`).then(r => r.data),
    enabled: !!taking && !taking.already_taken,
  });

  const submitMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/exams/${id}/submit`, data),
    onSuccess: (res) => {
      setResult(res.data);
      setTaking(null);
      qc.invalidateQueries(['student-exams']);
      qc.invalidateQueries(['student-dashboard']);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const handleSubmit = useCallback(() => {
    if (!taking || !examData) return;
    submitMut.mutate({ id: taking.id, data: { answers, start_time: startTime } });
  }, [taking, examData, answers, startTime]);

  useEffect(() => {
    if (!examData) return;
    const secs = examData.exam.duration_minutes * 60;
    setTimeLeft(secs);
    setStartTime(new Date().toISOString());
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(interval); handleSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
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
          <div className="card bg-navy-600 text-white flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-white">{exam.title}</h2>
              <p className="text-navy-100 text-sm font-medium mt-0.5">{answered}/{questions.length} سؤال أُجيب عليه</p>
            </div>
            <div className={`flex items-center gap-2 text-2xl font-black ${timeLeft < 60 ? 'text-red-300 animate-pulse' : 'text-orange-300'}`}>
              <Clock className="w-6 h-6" />
              {formatTime(timeLeft)}
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
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${qType === 'essay' ? 'bg-blue-100 text-blue-700' : qType === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                      {qType === 'essay' ? 'مقالي' : qType === 'true_false' ? 'صح/خطأ' : 'MCQ'}
                    </span>
                  </div>
                  <p className="font-semibold text-navy-700 mb-4 text-base leading-relaxed">{q.question_text}</p>
                  {q.question_image_url && (
                    <img src={q.question_image_url} alt="سؤال" className="w-full max-w-xs h-40 object-cover rounded-xl mb-4" />
                  )}

                  {qType === 'essay' ? (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="input-field h-28 resize-none text-sm"
                      placeholder="اكتب إجابتك هنا..."
                    />
                  ) : qType === 'true_false' ? (
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
                      {['A', 'B', 'C', 'D'].map(opt => q[`option_${opt.toLowerCase()}`] && (
                        <button key={opt} onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                          className={`p-3 rounded-xl text-sm font-semibold text-right transition-all border-2 ${answers[q.id] === opt ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-300 hover:border-navy-400 hover:bg-navy-50 text-navy-700'}`}>
                          <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ml-2 ${answers[q.id] === opt ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{opt}</span>
                          {q[`option_${opt.toLowerCase()}`]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-4">
            <button onClick={() => setTaking(null)} className="btn-secondary flex-1">إلغاء</button>
            <button onClick={handleSubmit} disabled={submitMut.isPending}
              className="btn-primary flex-1 py-3 text-base">
              {submitMut.isPending ? 'جاري الإرسال...' : `تسليم الاختبار (${answered}/${questions.length})`}
            </button>
          </div>
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
          <div className={`card text-center border-2 ${result.normalizedScore >= 50 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <div className="text-5xl mb-3">{result.normalizedScore >= 50 ? '🎉' : '📚'}</div>
            <h2 className="text-2xl font-black text-navy-700 mb-1">النتيجة</h2>
            <p className={`text-4xl font-black mb-3 ${result.normalizedScore >= 50 ? 'text-green-800' : 'text-red-800'}`}>{result.normalizedScore}/100</p>
            <div className="flex justify-center gap-6 text-sm flex-wrap">
              <span className="text-green-800 font-bold">✓ صواب: {result.result.correct_count}</span>
              <span className="text-red-800 font-bold">✗ خطأ: {result.result.wrong_count}</span>
            </div>
            {result.pointsEarned > 0 && <p className="mt-3 text-orange-700 font-bold">+{result.pointsEarned} نقطة! ⭐</p>}
            {result.detailedAnswers?.some(a => a.question_type === 'essay') && (
              <p className="mt-2 text-blue-700 text-sm font-bold bg-blue-50 rounded-lg px-3 py-2">📝 الأسئلة المقالية ستُصحَّح يدوياً من المعلم</p>
            )}
            <button onClick={() => setResult(null)} className="btn-primary mt-4">حسناً</button>
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
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-800 font-bold mb-3">
                      يبدأ في: {new Date(ex.start_date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  )}

                  {ex.already_taken ? (
                    <div className="space-y-2">
                      <div className={`text-center py-2 rounded-xl font-bold text-lg ${ex.score >= ex.pass_score ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {ex.score}/{ex.total_score}
                      </div>
                      <button onClick={() => navigate(`/student/exam-review/${ex.already_taken}`)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-navy-200 hover:border-navy-400 hover:bg-navy-50 text-navy-700 text-sm font-bold transition-all">
                        <Eye className="w-4 h-4" /> مراجعة الإجابات
                      </button>
                    </div>
                  ) : (
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
