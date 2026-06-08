import axios from 'axios';
import { getTenantSlug } from './tenant';

const api = axios.create({ baseURL: '/api' });

// [L-3] Proactive token refresh: when the stored JWT is within 24 h of expiry,
// silently call /auth/refresh to rotate it before it expires.
// Runs at most once per app load (the flag is per-tab, not per-request).
let _refreshAttempted = false;
function maybeRefreshToken() {
  if (_refreshAttempted) return;
  const token = localStorage.getItem('wathba_token');
  if (!token) return;
  try {
    // Decode payload without verifying signature (safe — we just need the exp field)
    const parts = token.split('.');
    if (parts.length !== 3) return;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const ttlLeft = (payload.exp || 0) - Math.floor(Date.now() / 1000);
    if (ttlLeft > 86_400) return; // > 24 h left — nothing to do
    _refreshAttempted = true;
    // Fire-and-forget refresh: swap the stored token on success
    axios.post('/api/auth/refresh', {}, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Slug': getTenantSlug() || '',
      },
    }).then(r => {
      if (r.data?.refreshed && r.data?.token) {
        localStorage.setItem('wathba_token', r.data.token);
      }
    }).catch(() => {});
  } catch (_) {}
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wathba_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // [L-3] Opportunistic refresh on each request (no-op if > 24h left)
    maybeRefreshToken();
  }

  const slug = getTenantSlug();
  if (slug) config.headers['X-Tenant-Slug'] = slug;

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;

    // [L-1] FIX: handle 403 account_suspended separately — show a specific
    // message and dispatch an event so pages can react without blindly
    // redirecting to login (the account still exists, it's just suspended)
    if (status === 403 && err.response?.data?.account_suspended) {
      window.dispatchEvent(new CustomEvent('wathba_account_suspended', {
        detail: { message: err.response.data.error || 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع المدرس.' }
      }));
      // Clear session so the student gets the login page on next navigation
      localStorage.removeItem('wathba_token');
      localStorage.removeItem('wathba_user');
      return Promise.reject(err);
    }

    if (status === 401) {
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
