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
      if (isInExam) return Promise.reject(err);

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
