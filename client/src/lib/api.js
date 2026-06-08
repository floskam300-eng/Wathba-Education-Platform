import axios from 'axios';
import { getTenantSlug } from './tenant';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wathba_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const slug = getTenantSlug();
  if (slug) config.headers['X-Tenant-Slug'] = slug;

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isInExam = Object.keys(localStorage).some(k => k.startsWith('exam_start_'));

      if (isInExam) {
        // [M-17] FIX: instead of silently swallowing the 401 during an exam,
        // dispatch a visible warning event. The ExamTake component listens to
        // this event and shows a non-blocking warning so the student knows
        // their session may have expired — while keeping their saved answers.
        window.dispatchEvent(new CustomEvent('wathba_exam_token_warning', {
          detail: { message: 'انتهت جلستك — إجاباتك محفوظة محلياً. سيتم تسليمها تلقائياً عند انتهاء الوقت.' }
        }));
        return Promise.reject(err);
      }

      localStorage.removeItem('wathba_token');
      localStorage.removeItem('wathba_user');
      if (!window.location.pathname.includes('/login')) {
        window.dispatchEvent(new CustomEvent('wathba_unauthorized'));
      }
    }
    return Promise.reject(err);
  }
);

export default api;
