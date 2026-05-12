import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const EVENT_ICONS = {
  notification:        '🔔',
  new_exam:            '📝',
  new_course:          '📚',
  enrollment_approved: '✅',
  enrollment_rejected: '❌',
  retry_approved:      '🔄',
  retry_rejected:      '❌',
  essay_graded:        '📊',
  new_request:         '📬',
  retry_request:       '🔄',
};

/**
 * useSSE — connects to /api/sse, listens for real-time events,
 * invalidates React Query caches, and shows toast notifications.
 *
 * @param {boolean} enabled  - only connect when the user is logged in
 * @param {string}  role     - "student" | "teacher" | "assistant"
 */
export function useSSE(enabled, role) {
  const qc = useQueryClient();
  const esRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem('wathba_token');
    if (!token) return;

    const url = `/api/sse?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      console.log('[SSE] connected');
    });

    if (role === 'student' || role === 'assistant') {
      es.addEventListener('notification', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['student-notifications'] });
        qc.invalidateQueries({ queryKey: ['student-dashboard'] });
        toast(
          `${EVENT_ICONS.notification} ${data.message}`,
          { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('new_exam', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['student-exams'] });
        qc.invalidateQueries({ queryKey: ['student-dashboard'] });
        qc.invalidateQueries({ queryKey: ['my-notifications'] });
        window.dispatchEvent(new CustomEvent('wathba_platform_notification', { detail: data }));
        toast.success(
          `${EVENT_ICONS.new_exam} اختبار جديد: ${data.title}`,
          { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('new_course', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['student-courses'] });
        qc.invalidateQueries({ queryKey: ['student-courses-all'] });
        qc.invalidateQueries({ queryKey: ['student-dashboard'] });
        toast.success(
          `${EVENT_ICONS.new_course} كورس جديد: ${data.name}`,
          { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('enrollment_approved', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['student-courses'] });
        qc.invalidateQueries({ queryKey: ['student-courses-all'] });
        qc.invalidateQueries({ queryKey: ['student-dashboard'] });
        qc.invalidateQueries({ queryKey: ['student-notifications'] });
        toast.success(
          `${EVENT_ICONS.enrollment_approved} تمت الموافقة على انضمامك لـ: ${data.course_name}`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('enrollment_rejected', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['student-courses-all'] });
        qc.invalidateQueries({ queryKey: ['student-notifications'] });
        toast.error(
          `${EVENT_ICONS.enrollment_rejected} رُفض طلب انضمامك لـ: ${data.course_name}`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('retry_approved', (e) => {
        qc.invalidateQueries({ queryKey: ['student-exams'] });
        qc.invalidateQueries({ queryKey: ['student-retry-requests'] });
        qc.invalidateQueries({ queryKey: ['student-notifications'] });
        toast.success(
          `${EVENT_ICONS.retry_approved} تمت الموافقة على طلب إعادة الاختبار!`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('retry_rejected', (e) => {
        qc.invalidateQueries({ queryKey: ['student-retry-requests'] });
        qc.invalidateQueries({ queryKey: ['student-notifications'] });
        toast.error(
          `${EVENT_ICONS.retry_rejected} رُفض طلب إعادة الاختبار`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('essay_graded', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['student-exams'] });
        qc.invalidateQueries({ queryKey: ['student-dashboard'] });
        qc.invalidateQueries({ queryKey: ['student-notifications'] });
        toast.success(
          `${EVENT_ICONS.essay_graded} تم تصحيح إجاباتك المقالية — درجتك الجديدة: ${data.new_score}`,
          { duration: 8000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('platform_notification', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['my-notifications'] });
        window.dispatchEvent(new CustomEvent('wathba_platform_notification', { detail: data }));
        const icon = {
          general: '📢', exam_result: '📊', new_exam: '📝', new_course: '📚',
          essay_graded: '✅', retry_approved: '🔄', enrollment_approved: '🎓',
          reminder: '⏰', announcement: '📣',
        }[data.type] || '🔔';
        toast(
          `${icon} ${data.title ? data.title + ' — ' : ''}${data.message}`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });
    }

    if (role === 'teacher' || role === 'assistant') {
      es.addEventListener('new_request', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['enrollment-requests'] });
        qc.invalidateQueries({ queryKey: ['course-requests'] });
        toast(
          `${EVENT_ICONS.new_request} طلب انضمام جديد من: ${data.student_name} لكورس: ${data.course_name}`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });

      es.addEventListener('retry_request', (e) => {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ['retry-requests'] });
        toast(
          `${EVENT_ICONS.retry_request} طلب إعادة اختبار من: ${data.student_name}`,
          { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } }
        );
      });
    }

    es.onerror = () => {
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled, role]);
}
