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
  new_request:         '📬',
  retry_request:       '🔄',
};

export function useSSE(enabled, role) {
  const qc = useQueryClient();
  const esRef = useRef(null);
  const retryRef = useRef(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    // Cancellation flag: set to true in cleanup so any in-flight async connect()
    // call aborts instead of creating an orphaned second EventSource connection.
    // This is the root cause of duplicate toast notifications — React StrictMode
    // double-invokes effects; if cleanup runs while the SSE-ticket fetch is still
    // awaiting, the cleanup finds esRef.current===null (nothing to close), the
    // second mount starts its own connect(), and then both async calls complete
    // and each registers event listeners on their own EventSource.
    let cancelled = false;

    const connect = async () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const freshToken = localStorage.getItem('wathba_token');
      if (!freshToken) return;

      // H-8 fix: fetch a short-lived one-time SSE ticket (30s TTL) so the
      // long-lived JWT never appears in the EventSource URL query string
      // (which would be captured by server logs and browser history).
      let sseUrl;
      try {
        const ticketRes = await fetch('/api/auth/sse-ticket', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${freshToken}` },
        });
        // Cleanup ran while we were awaiting the ticket — bail out immediately
        // to avoid creating an orphaned EventSource.
        if (cancelled) return;
        if (ticketRes.ok) {
          const { ticket } = await ticketRes.json();
          if (cancelled) return;
          sseUrl = `/api/sse?ticket=${encodeURIComponent(ticket)}`;
        } else {
          // Token rejected — don't reconnect; auth context will handle redirect
          return;
        }
      } catch {
        if (cancelled) return;
        // Network error fetching ticket — fall back to legacy token URL so
        // SSE still works (degraded security but better than no real-time)
        const token = localStorage.getItem('wathba_token');
        if (!token) return;
        sseUrl = `/api/sse?token=${encodeURIComponent(token)}`;
      }

      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.addEventListener('connected', () => {
        console.log('[SSE] connected');
        retryCountRef.current = 0;
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (cancelled) return; // don't reschedule if cleanup already ran
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000);
        retryCountRef.current += 1;
        console.log(`[SSE] disconnected — reconnecting in ${delay / 1000}s`);
        retryRef.current = setTimeout(connect, delay);
      };

      if (role === 'student' || role === 'assistant') {
        es.addEventListener('notification', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-notifications'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          toast(`${EVENT_ICONS.notification} ${data.message}`,
            { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('new_exam', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-exams'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          qc.invalidateQueries({ queryKey: ['my-notifications'] });
          window.dispatchEvent(new CustomEvent('wathba_platform_notification', { detail: data }));
          toast.success(`${EVENT_ICONS.new_exam} اختبار جديد متاح الآن: ${data.title}`,
            { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('exam_started', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-exams'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          qc.invalidateQueries({ queryKey: ['my-notifications'] });
          window.dispatchEvent(new CustomEvent('wathba_exam_started', { detail: data }));
          toast.success(`⏰ بدأ وقت اختبار: ${data.title} — يمكنك الدخول الآن!`,
            { duration: 8000, style: { fontFamily: 'inherit', direction: 'rtl', background: '#16a34a', color: '#fff' } });
        });

        es.addEventListener('new_course', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-courses'] });
          qc.invalidateQueries({ queryKey: ['student-courses-all'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          toast.success(`${EVENT_ICONS.new_course} كورس جديد: ${data.name}`,
            { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('course_unpublished', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-courses'] });
          qc.invalidateQueries({ queryKey: ['student-courses-all'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          qc.invalidateQueries({ queryKey: ['student-exams'] });
          toast(`🔕 الكورس "${data.name}" لم يعد متاحاً حالياً`,
            { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('exam_unpublished', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-exams'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          toast(`🔕 الاختبار "${data.title}" لم يعد متاحاً حالياً`,
            { duration: 6000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('enrollment_approved', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-courses'] });
          qc.invalidateQueries({ queryKey: ['student-courses-all'] });
          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
          qc.invalidateQueries({ queryKey: ['student-notifications'] });
          toast.success(`${EVENT_ICONS.enrollment_approved} تمت الموافقة على انضمامك لـ: ${data.course_name}`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('enrollment_rejected', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['student-courses-all'] });
          qc.invalidateQueries({ queryKey: ['student-notifications'] });
          toast.error(`${EVENT_ICONS.enrollment_rejected} رُفض طلب انضمامك لـ: ${data.course_name}`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('retry_approved', (e) => {
          qc.invalidateQueries({ queryKey: ['student-exams'] });
          qc.invalidateQueries({ queryKey: ['student-retry-requests'] });
          qc.invalidateQueries({ queryKey: ['student-notifications'] });
          toast.success(`${EVENT_ICONS.retry_approved} تمت الموافقة على طلب إعادة الاختبار!`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('retry_rejected', (e) => {
          qc.invalidateQueries({ queryKey: ['student-retry-requests'] });
          qc.invalidateQueries({ queryKey: ['student-notifications'] });
          toast.error(`${EVENT_ICONS.retry_rejected} رُفض طلب إعادة الاختبار`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('platform_notification', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['my-notifications'] });
          window.dispatchEvent(new CustomEvent('wathba_platform_notification', { detail: data }));
          const icon = { general: '📢', exam_result: '📊', new_exam: '📝', new_course: '📚',
            retry_approved: '🔄', enrollment_approved: '🎓', reminder: '⏰', announcement: '📣' }[data.type] || '🔔';
          toast(`${icon} ${data.title ? data.title + ' — ' : ''}${data.message}`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('live_started', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('wathba_live_started', { detail: data }));
          toast(`📡 بث مباشر: ${data.title} — انضم الآن!`, {
            duration: 12000,
            style: { fontFamily: 'inherit', direction: 'rtl', background: '#7f1d1d', color: '#fff' },
          });
        });

        es.addEventListener('live_permission_update', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('wathba_live_permission_update', { detail: data }));
          if (data.can_speak) {
            toast.success('🎤 منحك المعلم صلاحية التحدث!', {
              duration: 6000,
              style: { fontFamily: 'inherit', direction: 'rtl', background: '#1e3a5f', color: '#fff' },
            });
          }
          if (data.can_share_screen) {
            toast.success('🖥️ منحك المعلم صلاحية مشاركة الشاشة!', {
              duration: 6000,
              style: { fontFamily: 'inherit', direction: 'rtl', background: '#1e3a5f', color: '#fff' },
            });
          }
        });

        es.addEventListener('live_points_awarded', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          toast.success(`🎉 حصلت على ${data.points} نقطة! ${data.reason}`, {
            duration: 8000,
            style: { fontFamily: 'inherit', direction: 'rtl', background: '#14532d', color: '#fff' },
          });
        });

        es.addEventListener('live_kicked', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('wathba_live_kicked', { detail: data }));
          toast.error('🚫 تم إخراجك من البث من قِبَل المعلم', {
            duration: 7000,
            style: { fontFamily: 'inherit', direction: 'rtl' },
          });
        });
      }

      if (role === 'teacher' || role === 'assistant') {
        es.addEventListener('new_request', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['enrollment-requests'] });
          qc.invalidateQueries({ queryKey: ['course-requests'] });
          toast(`${EVENT_ICONS.new_request} طلب انضمام جديد من: ${data.student_name} لكورس: ${data.course_name}`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('retry_request', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['retry-requests'] });
          toast(`${EVENT_ICONS.retry_request} طلب إعادة اختبار من: ${data.student_name}`,
            { duration: 7000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('course_publish_changed', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['courses'] });
          qc.invalidateQueries({ queryKey: ['analytics'] });
          const msg = data.is_published
            ? `📢 تم نشر الكورس: ${data.name}`
            : `🔕 تم إلغاء نشر الكورس: ${data.name}`;
          toast(msg, { duration: 5000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('exam_publish_changed', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          qc.invalidateQueries({ queryKey: ['exams'] });
          qc.invalidateQueries({ queryKey: ['analytics'] });
          const msg = data.is_published
            ? `📝 تم نشر الاختبار: ${data.title}`
            : `🔕 تم إلغاء نشر الاختبار: ${data.title}`;
          toast(msg, { duration: 5000, style: { fontFamily: 'inherit', direction: 'rtl' } });
        });

        es.addEventListener('live_hand_raise', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('wathba_live_hand_raise', { detail: data }));
          if (data.raised) {
            toast(`✋ ${data.studentName} رفع يده`, {
              duration: 5000,
              style: { fontFamily: 'inherit', direction: 'rtl', background: '#1e3a5f', color: '#fff' },
            });
          }
        });

        es.addEventListener('live_viewer_update', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('wathba_live_viewer_update', { detail: data }));
        });

        es.addEventListener('live_chat', (e) => {
          let data; try { data = JSON.parse(e.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('wathba_live_chat', { detail: data }));
        });
      }
    };

    connect();

    return () => {
      cancelled = true; // signal any in-flight connect() to abort
      clearTimeout(retryRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [enabled, role]);
}
