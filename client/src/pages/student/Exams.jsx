import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Clock, CheckCircle, Play } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function StudentExams() {
  const qc = useQueryClient();
  const [taking, setTaking] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime, setStartTime] = useState(null);

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

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const openExam = (exam) => { setAnswers({}); setResult(null); setTaking(exam); };

  if (taking && examData && !taking.already_taken) {
    const { exam, questions } = examData;
    const answered = Object.keys(answers).length;

    return (
      <div className="space-y-6">
        {/* Exam header — dark navy bg, all text on dark = high contrast ✓ */}
        <div className="card bg-navy-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">{exam.title}</h2>
            {/* navy-100 on navy-600 = 6.5:1 ✓ */}
            <p className="text-navy-100 text-sm font-medium mt-0.5">{answered}/{questions.length} سؤال أُجيب عليه</p>
          </div>
          {/* red-300 on dark = ~9:1 ✓ | orange-300 on dark = ~5.7:1 ✓ */}
          <div className={`flex items-center gap-2 text-2xl font-black ${timeLeft < 60 ? 'text-red-300 animate-pulse' : 'text-orange-300'}`}>
            <Clock className="w-6 h-6" />
            {formatTime(timeLeft)}
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-orange-500 h-2.5 rounded-full transition-all" style={{ width: `${(answered / questions.length) * 100}%` }} />
        </div>

        <div className="space-y-6">
          {questions.map((q, qi) => (
            <div key={q.id} className={`card ${answers[q.id] ? 'border-2 border-orange-400' : ''}`}>
              {/* gray-600 on white = 7.2:1 ✓ */}
              <p className="text-xs text-gray-600 font-bold mb-1">السؤال {qi + 1}</p>
              <p className="font-semibold text-navy-700 mb-4 text-base leading-relaxed">{q.question_text}</p>
              {q.question_image_url && (
                <img src={q.question_image_url} alt="سؤال" className="w-full max-w-xs h-40 object-cover rounded-xl mb-4" />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['A', 'B', 'C', 'D'].map(opt => q[`option_${opt.toLowerCase()}`] && (
                  <button key={opt} onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                    className={`p-3 rounded-xl text-sm font-semibold text-right transition-all border-2 ${
                      answers[q.id] === opt
                        /* orange-800 on orange-50 = 6.5:1 ✓ */
                        ? 'border-orange-500 bg-orange-50 text-orange-800'
                        /* navy-700 on white = 12:1 ✓ */
                        : 'border-gray-300 hover:border-navy-400 hover:bg-navy-50 text-navy-700'
                    }`}>
                    {/* bg-orange-500 text-white ✓ | bg-gray-200 text-gray-700 = 8.9:1 ✓ */}
                    <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ml-2 ${answers[q.id] === opt ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{opt}</span>
                    {q[`option_${opt.toLowerCase()}`]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <button onClick={() => setTaking(null)} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={handleSubmit} disabled={submitMut.isPending}
            className="btn-primary flex-1 py-3 text-base">
            {submitMut.isPending ? 'جاري الإرسال...' : `تسليم الاختبار (${answered}/${questions.length})`}
          </button>
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
          {/* green-800/red-800 on their respective light bg = high contrast ✓ */}
          <p className={`text-4xl font-black mb-3 ${result.normalizedScore >= 50 ? 'text-green-800' : 'text-red-800'}`}>{result.normalizedScore}/100</p>
          <div className="flex justify-center gap-6 text-sm">
            <span className="text-green-800 font-bold">✓ صواب: {result.result.correct_count}</span>
            <span className="text-red-800 font-bold">✗ خطأ: {result.result.wrong_count}</span>
          </div>
          {/* orange-700 on white = 7.4:1 ✓ */}
          {result.pointsEarned > 0 && <p className="mt-3 text-orange-700 font-bold">+{result.pointsEarned} نقطة! ⭐</p>}
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
          {exams.map(ex => (
            <div key={ex.id} className={`card ${ex.already_taken ? 'border-2 border-green-300' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${ex.already_taken ? 'bg-green-100' : 'bg-gradient-to-br from-orange-500 to-orange-700'}`}>
                    {ex.already_taken ? <CheckCircle className="w-6 h-6 text-green-700" /> : <FileText className="w-6 h-6 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-600 text-sm">{ex.title}</h3>
                    {/* gray-600 on white = 7.2:1 ✓ */}
                    {ex.course_name && <p className="text-xs text-gray-600 font-medium">{ex.course_name}</p>}
                  </div>
                </div>
                {ex.already_taken && <Badge variant="success">✓ أُدي</Badge>}
              </div>

              <div className="flex flex-wrap gap-2 mb-4 text-xs">
                {/* gray-700 on gray-100 = 8.9:1 ✓ | orange-800 on orange-100 = 6.5:1 ✓ */}
                <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">⏱ {ex.duration_minutes} دقيقة</span>
                <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">📊 من {ex.total_score}</span>
                <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg">✓ النجاح: {ex.pass_score}</span>
                {ex.badge_name && <span className="bg-orange-100 text-orange-800 font-semibold px-2 py-1 rounded-lg">🏅 {ex.badge_name}</span>}
              </div>

              {ex.already_taken ? (
                <div className={`text-center py-2 rounded-xl font-bold text-lg ${ex.score >= ex.pass_score ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {ex.score}/{ex.total_score}
                </div>
              ) : (
                <button onClick={() => openExam(ex)} className="w-full btn-primary flex items-center justify-center gap-2">
                  <Play className="w-4 h-4" /> ابدأ الاختبار
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
